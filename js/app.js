/**
 * AniTrack - Main Application Controller (js/app.js)
 * Coordinates Collection, Franchise, Catalogue, Storage, and UI modules
 */

class AniTrackApp {
    constructor() {
        this.entries = [];
        this.franchises = [];
        this.platforms = [];
        this.hiddenFranchiseIds = [];
        this.showHiddenFranchises = false;
        this.defaultPlatforms = { anime: '', manga: '' };
        this.preferredApiSource = 'kitsu'; 
        
        // Settings & Filters
        this.titleDisplayMode = 'english';
        this.watchOrderTitleDisplayMode = 'english';
        this.activeCategory = 'anime';    // 'anime', 'manga', or 'franchise'
        this.activeStatus = 'all';         
        this.searchQuery = '';
        this.watchOrderSearchQuery = '';
        this.sortBy = 'updated';
        this.watchOrderSortBy = 'updated';
        this.autoBackupConfig = null;
        this.renderLimit = 30;
        this.renderBatchSize = 30;

        // Franchise active view ID
        this.activeFranchiseId = null;

        // Wizard Discovered State
        this.wizardDiscoveredEntries = [];

        // Add Franchise Entry Dialog State ('collection', 'catalog', or 'manual')
        this.addFranchiseTabMode = 'collection';
        this.selectedCatalogAddEntry = null;

        // API Abort Controllers
        this.wizardAbortController = null;
        this.addFranchiseAbortController = null;
        this.deferredPrompt = null;
        this.isInstalled = false;

        // Pending duplicate resolution buffer
        this.pendingDuplicateEntry = null;

        this.init();
    }

    init() {
        StorageModule.loadAll(this);
        this.setupEventListeners();
        this.setupPWA();
        this.detectInstalledState();
        this.checkAutoBackupSchedule();
        this.render();
    }

    // UI Helpers delegation
    escapeHTML(str) { return UIModule.escapeHTML(str); }
    normalizeTitle(str) { return UIModule.normalizeTitle(str); }
    showToast(msg, type) { UIModule.showToast(msg, type); }
    openModal(id, entryId) { UIModule.openModal(id, entryId); }
    closeModal(id) { UIModule.closeModal(id); }
    showConfirmDialog(title, message, onConfirm) { UIModule.showConfirmDialog(title, message, onConfirm); }
    getAdaptationBadgeInfo(status) { return UIModule.getAdaptationBadgeInfo(status); }

    // Storage save delegation
    saveEntriesToStorage() { StorageModule.saveEntries(this.entries); }
    saveFranchisesToStorage() { StorageModule.saveFranchises(this.franchises); }
    saveHiddenFranchisesToStorage() { StorageModule.saveHiddenFranchises(this.hiddenFranchiseIds); }
    savePlatformsToStorage() { StorageModule.savePlatforms(this.platforms); }
    saveDefaultsToStorage() { StorageModule.saveDefaults(this.defaultPlatforms); }

    // Event Listeners
    setupEventListeners() {
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                ['entry-modal', 'platforms-modal', 'platform-form-modal', 'confirm-modal', 'data-modal', 'franchise-wizard-modal', 'edit-franchise-modal', 'cover-franchise-modal', 'add-franchise-entry-modal'].forEach(id => this.closeModal(id));
                document.querySelectorAll('.card-action-menu').forEach(m => m.classList.add('hidden'));
            }
        });

        window.addEventListener('click', (e) => {
            if (!e.target.closest('.platform-dropdown-btn') && !e.target.closest('.platform-dropdown-menu')) {
                document.querySelectorAll('.platform-dropdown-menu').forEach(menu => menu.classList.add('hidden'));
            }
            if (!e.target.closest('.card-action-btn') && !e.target.closest('.card-action-menu')) {
                document.querySelectorAll('.card-action-menu').forEach(menu => menu.classList.add('hidden'));
            }
            if (!e.target.closest('.anime-card-item')) {
                document.querySelectorAll('.anime-card-item').forEach(card => card.classList.remove('active-overlay'));
            }
        });

        const updateOnlineStatus = () => {
            const banner = document.getElementById('offline-banner');
            if (!banner) return;
            if (navigator.onLine) {
                banner.classList.add('hidden');
            } else {
                banner.classList.remove('hidden');
            }
        };
        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);
        updateOnlineStatus();
    }

    setupPWA() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./service-worker.js', { scope: './' }).catch(err => {
                    console.warn('PWA: Service Worker registration error:', err);
                });
            });
        }

        // Capture browser installation prompt event (only fires when browser validates app criteria)
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            console.log('PWA: beforeinstallprompt received from browser');
            this.updateInstallUI();
        });

        // Capture when app has finished installation
        window.addEventListener('appinstalled', () => {
            this.isInstalled = true;
            this.deferredPrompt = null;
            localStorage.setItem('anitrack_is_installed', 'true');
            this.updateInstallUI();
            this.showToast('AniTrack installed successfully as an application!', 'success');
        });

        // Listen for display-mode changes (e.g. user opens standalone window)
        try {
            const standaloneMedia = window.matchMedia('(display-mode: standalone)');
            standaloneMedia.addEventListener('change', (evt) => {
                if (evt.matches) {
                    this.isInstalled = true;
                    this.updateInstallUI();
                }
            });
        } catch (err) {
            // Older browser fallback
        }
    }

    async detectInstalledState() {
        // 1. Display-mode standalone or fullscreen check
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                            window.matchMedia('(display-mode: fullscreen)').matches ||
                            window.matchMedia('(display-mode: minimal-ui)').matches;

        // 2. iOS Safari standalone boolean
        const isIOSStandalone = window.navigator && window.navigator.standalone === true;

        // 3. Android app referrer check
        const isAndroidReferrer = document.referrer.includes('android-app://');

        // 4. Stored persistent install flag
        const storedInstalled = localStorage.getItem('anitrack_is_installed') === 'true';

        // 5. Chromium getInstalledRelatedApps API (if supported)
        let hasRelatedApp = false;
        if ('getInstalledRelatedApps' in navigator && typeof navigator.getInstalledRelatedApps === 'function') {
            try {
                const apps = await navigator.getInstalledRelatedApps();
                if (Array.isArray(apps) && apps.length > 0) {
                    hasRelatedApp = true;
                }
            } catch (e) {
                // Ignore API access limitations
            }
        }

        this.isInstalled = isStandalone || isIOSStandalone || isAndroidReferrer || (storedInstalled && isStandalone) || hasRelatedApp;
        this.updateInstallUI();
        return this.isInstalled;
    }

    updateInstallUI() {
        const installBtn = document.getElementById('pwa-install-btn');
        const guideBtn = document.getElementById('pwa-guide-btn');

        if (this.isInstalled) {
            // If already installed, hide both buttons completely
            if (installBtn) installBtn.classList.add('hidden');
            if (guideBtn) guideBtn.classList.add('hidden');
            return;
        }

        if (this.deferredPrompt) {
            // ONLY show the actual Install button when beforeinstallprompt is ready
            if (installBtn) {
                installBtn.classList.remove('hidden');
                installBtn.classList.add('flex');
            }
            if (guideBtn) guideBtn.classList.add('hidden');
        } else {
            // When beforeinstallprompt is not available, show separate guide button
            if (installBtn) installBtn.classList.add('hidden');
            if (guideBtn) {
                guideBtn.classList.remove('hidden');
                guideBtn.classList.add('flex');
            }
        }
    }

    launchDirectTab() {
        window.open(window.location.href, '_blank');
    }

    async installPWA() {
        // If beforeinstallprompt is available, execute native prompt
        if (this.deferredPrompt) {
            try {
                await this.deferredPrompt.prompt();
                const choiceResult = await this.deferredPrompt.userChoice;
                if (choiceResult && choiceResult.outcome === 'accepted') {
                    this.isInstalled = true;
                    this.deferredPrompt = null;
                    localStorage.setItem('anitrack_is_installed', 'true');
                    this.updateInstallUI();
                    this.showToast('Installing AniTrack to your device...', 'success');
                } else {
                    this.showToast('Installation prompt was dismissed.', 'info');
                }
            } catch (err) {
                console.warn('PWA install prompt error:', err);
                this.openPwaGuide();
            }
            return;
        }

        // If beforeinstallprompt is not available, open dedicated installation guide
        this.openPwaGuide();
    }

    openPwaGuide(targetTab = null) {
        const userAgent = window.navigator.userAgent.toLowerCase();
        const isSamsung = userAgent.includes('samsungbrowser');
        const isAndroidChrome = userAgent.includes('android') && userAgent.includes('chrome') && !isSamsung;
        const isIOS = /iphone|ipad|ipod/.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        
        let detectedName = 'Desktop Browser (Chrome / Edge)';
        let initialTab = 'desktop';

        if (isSamsung) {
            detectedName = 'Samsung Internet (Galaxy Tablet / Phone)';
            initialTab = 'samsung';
        } else if (isAndroidChrome) {
            detectedName = 'Android Chrome Browser';
            initialTab = 'chrome';
        } else if (isIOS) {
            detectedName = 'Apple Safari (iPad / iPhone)';
            initialTab = 'ios';
        }

        const detectedEl = document.getElementById('pwa-detected-browser');
        if (detectedEl) {
            detectedEl.textContent = `Detected: ${detectedName}`;
        }

        // Detect iframe preview window
        const isInIframe = window.self !== window.top;
        const iframeNotice = document.getElementById('pwa-iframe-notice');
        if (iframeNotice) {
            if (isInIframe) iframeNotice.classList.remove('hidden');
            else iframeNotice.classList.add('hidden');
        }

        this.switchPwaGuideTab(targetTab || initialTab);
        this.checkPwaStatusDiagnostics();
        this.openModal('pwa-install-modal');
    }

    switchPwaGuideTab(tabName) {
        const tabs = ['samsung', 'chrome', 'ios', 'desktop'];
        tabs.forEach(name => {
            const btn = document.getElementById(`tab-guide-${name}`);
            const panel = document.getElementById(`guide-panel-${name}`);
            if (name === tabName) {
                if (btn) btn.className = "py-1.5 px-1 rounded-lg transition-colors bg-cyber-cyan text-slate-950 font-bold shadow-sm";
                if (panel) panel.classList.remove('hidden');
            } else {
                if (btn) btn.className = "py-1.5 px-1 rounded-lg transition-colors text-slate-400 hover:text-white";
                if (panel) panel.classList.add('hidden');
            }
        });
    }

    async checkPwaStatusDiagnostics() {
        const httpsEl = document.getElementById('pwa-diag-https');
        const manifestEl = document.getElementById('pwa-diag-manifest');
        const swEl = document.getElementById('pwa-diag-sw');
        const promptEl = document.getElementById('pwa-diag-prompt');

        // 1. Check HTTPS
        const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (httpsEl) {
            httpsEl.className = isSecure ? "font-bold text-emerald-400" : "font-bold text-rose-400";
            httpsEl.textContent = isSecure ? "Active (Secure)" : "Insecure (HTTP)";
        }

        // 2. Check Manifest & Icons
        if (manifestEl) {
            try {
                const res = await fetch('./manifest.json', { cache: 'no-cache' });
                if (res.ok) {
                    manifestEl.className = "font-bold text-emerald-400";
                    manifestEl.textContent = "Valid (Loaded)";
                } else {
                    manifestEl.className = "font-bold text-rose-400";
                    manifestEl.textContent = `Error (${res.status})`;
                }
            } catch (err) {
                manifestEl.className = "font-bold text-amber-400";
                manifestEl.textContent = "Check Relative Path";
            }
        }

        // 3. Check Service Worker
        if (swEl) {
            const isSwActive = 'serviceWorker' in navigator && !!navigator.serviceWorker.controller;
            swEl.className = isSwActive ? "font-bold text-emerald-400" : "font-bold text-amber-400";
            swEl.textContent = isSwActive ? "Active & Running" : "Registering...";
        }

        // 4. Check Install Prompt Event
        if (promptEl) {
            if (this.isInstalled) {
                promptEl.className = "font-bold text-emerald-400";
                promptEl.textContent = "App Installed";
            } else if (this.deferredPrompt) {
                promptEl.className = "font-bold text-cyber-cyan";
                promptEl.textContent = "Ready (Prompt Available)";
            } else {
                promptEl.className = "font-bold text-slate-400";
                promptEl.textContent = "Managed by Browser";
            }
        }
    }

    setApiSource(source) {
        if (source !== 'kitsu' && source !== 'anilist') return;
        this.preferredApiSource = source;
        StorageModule.savePreferredSource(source);
        this.updateApiSourceUI();
        
        const resultsEl = document.getElementById('catalog-search-results');
        const statusEl = document.getElementById('catalog-search-status');
        if (resultsEl) { resultsEl.innerHTML = ''; resultsEl.classList.add('hidden'); }
        if (statusEl) { statusEl.textContent = `Switched to ${source === 'anilist' ? 'AniList' : 'Kitsu'}. Enter a query and click Search.`; statusEl.classList.remove('hidden'); }
    }

    updateApiSourceUI() {
        const kitsuBtn = document.getElementById('api-source-kitsu');
        const anilistBtn = document.getElementById('api-source-anilist');
        if (!kitsuBtn || !anilistBtn) return;

        if (this.preferredApiSource === 'anilist') {
            anilistBtn.className = "px-3 py-1 rounded-md font-bold bg-[#3db4f2] text-slate-950 shadow-sm transition-colors";
            kitsuBtn.className = "px-3 py-1 rounded-md font-medium text-slate-400 hover:text-white transition-colors";
        } else {
            kitsuBtn.className = "px-3 py-1 rounded-md font-bold bg-brand-600 text-white shadow-sm transition-colors";
            anilistBtn.className = "px-3 py-1 rounded-md font-medium text-slate-400 hover:text-white transition-colors";
        }
    }

    getEntryTitle(entry) {
        return CollectionModule.getEntryTitle(entry, this.titleDisplayMode);
    }

    getWatchOrderDisplayTitle(franchiseEntry, linkedCollectionEntry = null) {
        return FranchiseModule.getWatchOrderDisplayTitle(franchiseEntry, linkedCollectionEntry, this.watchOrderTitleDisplayMode);
    }

    setWatchOrderTitleDisplayMode(mode) {
        if (!['english', 'romanji'].includes(mode)) return;
        this.watchOrderTitleDisplayMode = mode;
        StorageModule.saveWatchOrderTitleMode(mode);
        this.render();
    }

    setTitleDisplayMode(mode) {
        this.titleDisplayMode = mode;
        const engBtn = document.getElementById('title-mode-english');
        const romBtn = document.getElementById('title-mode-romanji');
        
        if (mode === 'english') {
            engBtn.className = "px-2.5 py-1 rounded-lg font-bold bg-brand-600 text-white shadow-sm";
            romBtn.className = "px-2.5 py-1 rounded-lg font-medium text-slate-400 hover:text-white transition-colors";
        } else {
            romBtn.className = "px-2.5 py-1 rounded-lg font-bold bg-cyber-pink text-white shadow-sm";
            engBtn.className = "px-2.5 py-1 rounded-lg font-medium text-slate-400 hover:text-white transition-colors";
        }
        this.renderGrid();
    }

    handleFormStatusChange() {
        const status = document.getElementById('form-status').value;
        const totalInput = document.getElementById('form-total-progress');
        const currentInput = document.getElementById('form-current-progress');
        const totalVal = parseInt(totalInput.value) || 0;

        if (status === 'completed' && totalVal > 0) {
            currentInput.value = totalVal;
        }
    }

    handleFormTotalChange() {
        const status = document.getElementById('form-status').value;
        const totalVal = parseInt(document.getElementById('form-total-progress').value) || 0;
        if (status === 'completed' && totalVal > 0) {
            document.getElementById('form-current-progress').value = totalVal;
        }
    }

    updatePosterPreview() {
        const url = document.getElementById('form-cover-url').value.trim();
        const img = document.getElementById('poster-preview');
        if (url) {
            img.src = url;
            img.classList.remove('hidden');
            img.onerror = () => { img.classList.add('hidden'); };
        } else {
            img.classList.add('hidden');
        }
    }

    searchCatalog() {
        CatalogueModule.searchCatalog(this.preferredApiSource);
    }

    selectCatalogResult(item) {
        document.getElementById('form-kitsu-id').value = item.kitsuId || '';
        document.getElementById('form-anilist-id').value = item.anilistId || '';
        document.getElementById('form-title-english').value = item.titleEnglish;
        document.getElementById('form-title-romanji').value = item.titleRomanji;
        document.getElementById('form-category').value = item.category;
        
        if (item.seasonInfo) document.getElementById('form-season').value = item.seasonInfo;
        if (item.imageUrl) document.getElementById('form-cover-url').value = item.imageUrl;
        
        if (Number.isInteger(item.total) && item.total > 0) {
            document.getElementById('form-total-progress').value = item.total;
        }

        if (item.externalRating) {
            document.getElementById('form-external-rating').value = item.externalRating;
            document.getElementById('form-rating-source').value = item.source || 'Catalog';
            document.getElementById('form-rating-updated-at').value = new Date().toISOString();
        }

        this.updatePosterPreview();
        this.toggleCategoryFormLabels();

        const duplicateMatch = CatalogueModule.findExistingMatch(this.entries, {
            kitsuId: item.kitsuId,
            anilistId: item.anilistId,
            titles: { english: item.titleEnglish, romanji: item.titleRomanji },
            category: item.category
        });

        const dupWarn = document.getElementById('duplicate-warning');
        if (duplicateMatch) {
            this.pendingDuplicateEntry = duplicateMatch;
            const reason = duplicateMatch.matchType === 'exact-kitsu-id' ? 'same Kitsu ID' : duplicateMatch.matchType === 'exact-anilist-id' ? 'same AniList ID' : 'same primary title';
            document.getElementById('duplicate-warning-title').textContent = duplicateMatch.matchType.includes('id') ? 'Already in your collection (Catalogue ID Match)' : 'Matching Primary Title Found';
            document.getElementById('duplicate-warning-desc').textContent = `"${duplicateMatch.entry.titles?.english || duplicateMatch.entry.title}" matches by ${reason}.`;
            dupWarn.classList.remove('hidden');
        } else {
            this.pendingDuplicateEntry = null;
            dupWarn.classList.add('hidden');
        }

        const statusEl = document.getElementById('catalog-search-status');
        statusEl.textContent = `Auto-filled details for "${item.titleEnglish}" via ${item.source}.`;
        statusEl.classList.remove('hidden');
        document.getElementById('catalog-search-results').classList.add('hidden');
        this.showToast(`Auto-filled details for "${this.escapeHTML(item.titleEnglish)}"`, 'success');
    }

    useExistingDuplicateEntry() {
        if (!this.pendingDuplicateEntry) return;
        const match = this.pendingDuplicateEntry.entry;
        document.getElementById('entry-id').value = match.id;
        document.getElementById('form-title-english').value = match.titles?.english || match.titleEnglish || '';
        document.getElementById('form-title-romanji').value = match.titles?.romanji || match.titleRomanji || '';
        document.getElementById('form-category').value = match.category;
        document.getElementById('form-status').value = match.status;
        document.getElementById('form-current-progress').value = match.currentProgress;
        document.getElementById('form-total-progress').value = match.totalProgress;
        document.getElementById('form-season').value = match.season || '';
        document.getElementById('form-cover-url').value = match.coverUrl || '';
        document.getElementById('form-external-url').value = match.externalUrl || '';
        document.getElementById('duplicate-warning').classList.add('hidden');
        this.showToast(`Loaded existing entry "${this.escapeHTML(match.titles?.english || match.title)}" for editing`, 'info');
    }

    saveEntry(e) {
        e.preventDefault();
        const id = document.getElementById('entry-id').value;
        const kitsuId = document.getElementById('form-kitsu-id').value.trim();
        const anilistId = document.getElementById('form-anilist-id').value.trim();
        const titleEnglish = document.getElementById('form-title-english').value.trim();
        const titleRomanji = document.getElementById('form-title-romanji').value.trim() || titleEnglish;
        const alternativesInput = document.getElementById('form-title-alternatives').value.trim();
        const alternatives = alternativesInput ? alternativesInput.split(',').map(s => s.trim()).filter(Boolean) : [];
        const preferredTitleMode = document.getElementById('form-preferred-title')?.value || 'english';

        const category = document.getElementById('form-category').value;
        let status = document.getElementById('form-status').value;
        let currentProgress = parseInt(document.getElementById('form-current-progress').value) || 0;
        const totalProgress = parseInt(document.getElementById('form-total-progress').value) || 0;
        const externalRating = parseFloat(document.getElementById('form-external-rating').value) || 0;
        const ratingSource = document.getElementById('form-rating-source').value || '';
        const ratingUpdatedAt = document.getElementById('form-rating-updated-at').value || new Date().toISOString();
        const season = document.getElementById('form-season').value.trim();
        const coverUrl = document.getElementById('form-cover-url').value.trim();
        const externalUrl = document.getElementById('form-external-url').value.trim();

        const title = titleEnglish || titleRomanji || 'Untitled';

        if (totalProgress > 0 && currentProgress >= totalProgress) {
            currentProgress = totalProgress;
            status = 'completed';
        }

        let savedEntryRecord = null;

        if (id) {
            const index = this.entries.findIndex(item => item.id === id);
            if (index !== -1) {
                this.entries[index] = {
                    ...this.entries[index],
                    externalIds: {
                        kitsu: kitsuId || this.entries[index].externalIds?.kitsu || null,
                        anilist: anilistId || this.entries[index].externalIds?.anilist || null
                    },
                    titles: {
                        english: titleEnglish || this.entries[index].titles?.english || title,
                        romanji: titleRomanji || this.entries[index].titles?.romanji || title,
                        alternatives: alternatives.length > 0 ? alternatives : (this.entries[index].titles?.alternatives || [])
                    },
                    preferredTitleMode,
                    title, titleEnglish, titleRomanji, category, status, 
                    currentProgress, totalProgress, 
                    externalRating, ratingSource, ratingUpdatedAt, 
                    season, coverUrl, externalUrl,
                    updatedAt: Date.now()
                };
                savedEntryRecord = this.entries[index];
                this.showToast(`Updated "${this.escapeHTML(title)}"`, 'success');
            }
        } else {
            savedEntryRecord = {
                id: 'entry-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
                internalId: 'entry-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
                source: { provider: kitsuId ? 'kitsu' : (anilistId ? 'anilist' : 'manual'), providerId: kitsuId || anilistId || null },
                externalIds: { kitsu: kitsuId || null, anilist: anilistId || null },
                titles: { english: titleEnglish || title, romanji: titleRomanji || title, alternatives },
                preferredTitleMode,
                title, titleEnglish, titleRomanji, category, status, 
                currentProgress, totalProgress, externalRating, ratingSource, 
                ratingUpdatedAt, season, coverUrl, externalUrl,
                updatedAt: Date.now()
            };
            this.entries.unshift(savedEntryRecord);
            this.showToast(`Added "${this.escapeHTML(title)}"`, 'success');
        }

        this.saveEntriesToStorage();
        
        if (savedEntryRecord) {
            this.syncCollectionUpdatesToFranchises(savedEntryRecord);
        }

        this.closeModal('entry-modal');
        this.render();
    }

    incrementProgress(id, e) {
        if (e) e.stopPropagation();
        const entry = this.entries.find(item => item.id === id);
        if (!entry) return;

        entry.currentProgress += 1;
        entry.updatedAt = Date.now();

        const isAnime = entry.category === 'anime';
        const unit = isAnime ? 'Episode' : 'Chapter';

        if (entry.totalProgress > 0 && entry.currentProgress >= entry.totalProgress) {
            entry.currentProgress = entry.totalProgress;
            entry.status = 'completed';
            this.showToast(`🎉 Completed "${this.escapeHTML(this.getEntryTitle(entry))}"!`, 'success');
        } else {
            this.showToast(`Updated "${this.escapeHTML(this.getEntryTitle(entry))}" to ${unit} ${entry.currentProgress}`, 'info');
        }

        this.saveEntriesToStorage();
        this.syncCollectionUpdatesToFranchises(entry);
        this.render();
    }

    deleteEntry(id, e) {
        if (e) e.stopPropagation();
        const entry = this.entries.find(item => item.id === id);
        if (!entry) return;

        this.showConfirmDialog(
            'Delete Media Entry',
            `Delete "${this.escapeHTML(this.getEntryTitle(entry))}" from collection? (Linked franchise entries will remain unlinked).`,
            () => {
                this.entries = this.entries.filter(item => item.id !== id);
                this.franchises.forEach(f => {
                    f.entries.forEach(fe => {
                        if (fe.collectionId === id || fe.linkedCollectionId === id) {
                            fe.collectionId = null;
                            fe.linkedCollectionId = null;
                        }
                    });
                });
                this.saveEntriesToStorage();
                this.saveFranchisesToStorage();
                this.showToast(`Removed "${this.escapeHTML(this.getEntryTitle(entry))}"`, 'info');
                this.render();
            }
        );
    }

    setCategory(category) {
        this.activeCategory = category;
        this.renderLimit = this.renderBatchSize;
        
        const standardFilters = document.getElementById('standard-filters-container');
        const franchiseAction = document.getElementById('franchise-action-container');
        const watchOrderSearchWrapper = document.getElementById('watch-order-search-wrapper');
        const searchSort = document.getElementById('search-sort-container');
        const divider = document.getElementById('control-divider');

        if (category === 'franchise') {
            standardFilters.classList.add('hidden');
            franchiseAction.classList.remove('hidden');
            if (!this.activeFranchiseId) {
                watchOrderSearchWrapper.classList.remove('hidden');
            } else {
                watchOrderSearchWrapper.classList.add('hidden');
            }
            searchSort.classList.add('hidden');
            divider.classList.add('hidden');
        } else {
            standardFilters.classList.remove('hidden');
            franchiseAction.classList.add('hidden');
            watchOrderSearchWrapper.classList.add('hidden');
            searchSort.classList.remove('hidden');
            divider.classList.remove('hidden');
            this.activeFranchiseId = null;
            this.toggleCategoryFormLabels();
        }

        this.render();
    }

    setStatus(status) {
        this.activeStatus = status;
        this.renderLimit = this.renderBatchSize;
        this.render();
    }

    handleSearch() {
        this.searchQuery = document.getElementById('search-input').value.toLowerCase().trim();
        this.renderLimit = this.renderBatchSize;
        this.renderGrid();
    }

    handleWatchOrderSearch() {
        this.watchOrderSearchQuery = document.getElementById('watch-order-search-input').value.trim();
        const clearBtn = document.getElementById('watch-order-search-clear');
        if (this.watchOrderSearchQuery) clearBtn.classList.remove('hidden');
        else clearBtn.classList.add('hidden');
        this.renderGrid();
    }

    clearWatchOrderSearch() {
        this.watchOrderSearchQuery = '';
        const woInput = document.getElementById('watch-order-search-input');
        if (woInput) woInput.value = '';
        document.getElementById('watch-order-search-clear')?.classList.add('hidden');
        this.renderGrid();
    }

    handleWatchOrderSort() {
        const select = document.getElementById('watch-order-sort-select');
        if (!select) return;
        this.watchOrderSortBy = select.value;
        this.renderGrid();
    }

    resetWatchOrderFilters() {
        this.watchOrderSearchQuery = '';
        this.watchOrderSortBy = 'updated';
        const woInput = document.getElementById('watch-order-search-input');
        if (woInput) woInput.value = '';
        document.getElementById('watch-order-search-clear')?.classList.add('hidden');
        const woSelect = document.getElementById('watch-order-sort-select');
        if (woSelect) woSelect.value = 'updated';
        this.renderGrid();
    }

    handleSort() {
        this.sortBy = document.getElementById('sort-select').value;
        this.renderLimit = this.renderBatchSize;
        this.renderGrid();
    }

    resetFilters() {
        this.searchQuery = '';
        this.watchOrderSearchQuery = '';
        this.watchOrderSortBy = 'updated';
        const searchInput = document.getElementById('search-input');
        if (searchInput) searchInput.value = '';
        const woInput = document.getElementById('watch-order-search-input');
        if (woInput) woInput.value = '';
        const woClear = document.getElementById('watch-order-search-clear');
        if (woClear) woClear.classList.add('hidden');
        const woSelect = document.getElementById('watch-order-sort-select');
        if (woSelect) woSelect.value = 'updated';

        this.sortBy = 'updated';
        const sortSelect = document.getElementById('sort-select');
        if (sortSelect) sortSelect.value = 'updated';

        if (this.activeCategory !== 'franchise') {
            this.activeCategory = 'anime';
            this.activeStatus = 'all';
        }
        this.activeFranchiseId = null;
        this.renderLimit = this.renderBatchSize;
        this.render();
    }

    toggleCategoryFormLabels() {
        const cat = document.getElementById('form-category').value;
        document.getElementById('opt-status-active').textContent = cat === 'anime' ? 'Watching' : 'Reading';
        document.getElementById('lbl-progress-current').textContent = cat === 'anime' ? 'Watched Episodes' : 'Read Chapters';
        document.getElementById('lbl-progress-total').textContent = cat === 'anime' ? 'Total Episodes (0 = ∞)' : 'Total Chapters (0 = ∞)';
    }

    toggleShowHiddenFranchises() {
        this.showHiddenFranchises = !this.showHiddenFranchises;
        const btnText = document.getElementById('toggle-hidden-text');
        if (btnText) {
            btnText.textContent = this.showHiddenFranchises ? 'Hide Hidden' : 'Show Hidden';
        }
        this.renderGrid();
    }

    hideFranchise(franchiseId, e) {
        if (e) e.stopPropagation();
        if (!this.hiddenFranchiseIds.includes(franchiseId)) {
            this.hiddenFranchiseIds.push(franchiseId);
            this.saveHiddenFranchisesToStorage();
            this.showToast('Franchise hidden from view', 'info');
            this.render();
        }
    }

    restoreFranchise(franchiseId, e) {
        if (e) e.stopPropagation();
        this.hiddenFranchiseIds = this.hiddenFranchiseIds.filter(id => id !== franchiseId);
        this.saveHiddenFranchisesToStorage();
        this.showToast('Franchise restored to view', 'success');
        this.render();
    }

    openAddFranchiseEntryModal(franchiseId) {
        const franc = this.franchises.find(f => f.id === franchiseId);
        if (!franc) return;

        document.getElementById('add-fe-franchise-id').value = franchiseId;
        document.getElementById('add-fe-selected-collection-id').value = '';
        document.getElementById('add-fe-selected-external-id').value = '';
        document.getElementById('add-fe-selected-kitsu-id').value = '';
        document.getElementById('add-fe-selected-anilist-id').value = '';
        document.getElementById('add-fe-selected-rating').value = '';
        document.getElementById('add-fe-selected-source').value = '';
        document.getElementById('add-fe-manual-form').reset();
        document.getElementById('add-fe-collection-search-input').value = '';
        document.getElementById('add-fe-catalog-search-input').value = '';
        document.getElementById('add-fe-catalog-results').innerHTML = '';
        document.getElementById('add-fe-catalog-results').classList.add('hidden');
        document.getElementById('add-fe-catalog-status').classList.add('hidden');
        document.getElementById('add-fe-status-notice').classList.add('hidden');
        document.getElementById('add-fe-sync-collection').checked = true;

        this.switchAddFranchiseTab('collection');
        this.searchFranchiseCollectionQuery();
        this.openModal('add-franchise-entry-modal');
    }

    switchAddFranchiseTab(mode) {
        this.addFranchiseTabMode = mode;
        const colBtn = document.getElementById('add-fe-tab-collection');
        const catalogBtn = document.getElementById('add-fe-tab-catalog');
        const manualBtn = document.getElementById('add-fe-tab-manual');
        
        const colPanel = document.getElementById('add-fe-panel-collection');
        const catalogPanel = document.getElementById('add-fe-panel-catalog');
        const manualForm = document.getElementById('add-fe-manual-form');
        const syncContainer = document.getElementById('sync-collection-container');

        [colBtn, catalogBtn, manualBtn].forEach(b => b.className = "py-2 rounded-lg font-medium text-slate-400 hover:text-white transition-colors");
        [colPanel, catalogPanel, manualForm].forEach(p => p.classList.add('hidden'));

        if (mode === 'collection') {
            colBtn.className = "py-2 rounded-lg font-bold bg-brand-600 text-white transition-colors";
            colPanel.classList.remove('hidden');
            syncContainer.classList.add('hidden');
        } else if (mode === 'catalog') {
            catalogBtn.className = "py-2 rounded-lg font-bold bg-brand-600 text-white transition-colors";
            catalogPanel.classList.remove('hidden');
            syncContainer.classList.remove('hidden');
        } else {
            manualBtn.className = "py-2 rounded-lg font-bold bg-brand-600 text-white transition-colors";
            manualForm.classList.remove('hidden');
            syncContainer.classList.remove('hidden');
            this.selectedCatalogAddEntry = null;
        }
    }

    searchFranchiseCollectionQuery() {
        const query = this.normalizeTitle(document.getElementById('add-fe-collection-search-input').value);
        const resultsEl = document.getElementById('add-fe-collection-results');

        const matches = this.entries.filter(item => {
            if (!query) return true;
            const normEng = this.normalizeTitle(item.titles?.english || item.titleEnglish);
            const normRom = this.normalizeTitle(item.titles?.romanji || item.titleRomanji);
            const normJap = this.normalizeTitle(item.titles?.japanese);
            const alts = (item.titles?.alternatives || []).map(a => this.normalizeTitle(a));

            return normEng.includes(query) || normRom.includes(query) || normJap.includes(query) || alts.some(a => a.includes(query));
        });

        if (matches.length === 0) {
            resultsEl.innerHTML = `<p class="text-xs text-slate-500 italic p-3 text-center">No matching collection entries found.</p>`;
            return;
        }

        resultsEl.innerHTML = matches.map(item => `
            <button type="button" onclick="app.selectCollectionEntryForFranchise('${item.id}')" class="w-full flex items-center gap-3 p-2.5 rounded-xl border border-slate-800 bg-slate-950/80 hover:bg-slate-800 hover:border-brand-500 text-left transition-colors">
                <img src="${this.escapeHTML(item.coverUrl || UIModule.SVG_POSTER_FALLBACK)}" onerror="this.src='${UIModule.SVG_POSTER_FALLBACK}';" class="w-10 h-14 object-cover rounded-lg bg-slate-900 shrink-0">
                <div class="min-w-0 flex-1">
                    <h5 class="text-xs font-bold text-white truncate">${this.escapeHTML(item.titles?.english || item.title)}</h5>
                    <p class="text-[10px] text-brand-300 truncate">${this.escapeHTML(item.titles?.romanji || '')}</p>
                    <p class="text-[10px] text-slate-400 mt-0.5">${item.category.toUpperCase()} · ${item.season || 'TV'} · ${item.currentProgress}/${item.totalProgress || '∞'} eps · <span class="text-emerald-400 font-semibold">✓ In Collection</span></p>
                </div>
            </button>
        `).join('');
    }

    selectCollectionEntryForFranchise(entryId) {
        const item = this.entries.find(e => e.id === entryId);
        if (!item) return;

        document.getElementById('add-fe-selected-collection-id').value = item.id;
        document.getElementById('add-fe-selected-external-id').value = item.externalIds?.kitsu ? `kitsu-${item.externalIds.kitsu}` : (item.externalIds?.anilist ? `anilist-${item.externalIds.anilist}` : '');
        document.getElementById('add-fe-selected-kitsu-id').value = item.externalIds?.kitsu || '';
        document.getElementById('add-fe-selected-anilist-id').value = item.externalIds?.anilist || '';
        document.getElementById('add-fe-selected-rating').value = item.externalRating || 0;
        document.getElementById('add-fe-selected-source').value = item.ratingSource || 'Collection';

        const notice = document.getElementById('add-fe-status-notice');
        notice.textContent = `Selected from collection: "${item.titles?.english || item.title}"`;
        notice.classList.remove('hidden');
        this.showToast(`Selected "${this.escapeHTML(item.titles?.english || item.title)}" from collection`, 'success');
    }

    async searchFranchiseAddCatalog() {
        if (!navigator.onLine) {
            this.showToast('Catalogue search requires active internet connection.', 'error');
            return;
        }

        const query = document.getElementById('add-fe-catalog-search-input').value.trim();
        const statusEl = document.getElementById('add-fe-catalog-status');
        const resultsEl = document.getElementById('add-fe-catalog-results');

        if (query.length < 2) {
            statusEl.textContent = 'Enter at least 2 characters.';
            statusEl.classList.remove('hidden');
            return;
        }

        if (this.addFranchiseAbortController) this.addFranchiseAbortController.abort();
        this.addFranchiseAbortController = new AbortController();

        statusEl.textContent = `Searching ${this.preferredApiSource === 'anilist' ? 'AniList' : 'Kitsu'}…`;
        statusEl.classList.remove('hidden');
        resultsEl.innerHTML = '';
        resultsEl.classList.add('hidden');

        try {
            let unifiedResults = [];
            if (this.preferredApiSource === 'kitsu') {
                const url = `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(query)}&page[limit]=6`;
                const res = await fetch(url, { signal: this.addFranchiseAbortController.signal });
                if (res.ok) {
                    const data = await res.json();
                    const items = Array.isArray(data.data) ? data.data : [];
                    items.forEach(item => {
                        const attr = item.attributes || {};
                        const kitsuId = String(item.id);
                        const titleEnglish = attr.titles?.en || attr.canonicalTitle || 'Untitled';
                        const titleRomanji = attr.titles?.en_jp || attr.canonicalTitle || titleEnglish;
                        const titleJapanese = attr.titles?.ja_jp || '';
                        const imageUrl = attr.posterImage?.medium || attr.posterImage?.original || '';
                        const year = attr.startDate ? attr.startDate.slice(0, 4) : '';
                        const total = attr.episodeCount || 0;
                        const subtype = attr.subtype ? attr.subtype.toUpperCase() : 'TV';

                        unifiedResults.push({
                            id: 'kitsu-' + kitsuId,
                            kitsuId,
                            anilistId: null,
                            titleEnglish,
                            titleRomanji,
                            titleJapanese,
                            imageUrl,
                            total,
                            seasonInfo: `${subtype} ${year ? `(${year})` : ''}`,
                            externalRating: attr.averageRating ? parseFloat((parseFloat(attr.averageRating) / 10).toFixed(1)) : 0,
                            source: 'Kitsu'
                        });
                    });
                }
            } else {
                const gqlQuery = `
                    query ($search: String) {
                        Page (perPage: 6) {
                            media (search: $search, type: ANIME) {
                                id
                                title { english romaji native }
                                coverImage { large medium }
                                episodes
                                seasonYear
                                format
                                averageScore
                            }
                        }
                    }
                `;
                const res = await fetch('https://graphql.anilist.co', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify({ query: gqlQuery, variables: { search: query } }),
                    signal: this.addFranchiseAbortController.signal
                });
                if (res.ok) {
                    const payload = await res.json();
                    const mediaList = payload.data?.Page?.media || [];
                    mediaList.forEach(item => {
                        const anilistId = String(item.id);
                        const titleEnglish = item.title?.english || item.title?.romaji || 'Untitled';
                        const titleRomanji = item.title?.romaji || item.title?.english || titleEnglish;
                        const titleJapanese = item.title?.native || '';
                        const imageUrl = item.coverImage?.large || item.coverImage?.medium || '';
                        const total = item.episodes || 0;
                        const year = item.seasonYear ? String(item.seasonYear) : '';
                        const format = item.format ? item.format.replace(/_/g, ' ') : 'ANIME';

                        unifiedResults.push({
                            id: 'anilist-' + anilistId,
                            kitsuId: null,
                            anilistId,
                            titleEnglish,
                            titleRomanji,
                            titleJapanese,
                            imageUrl,
                            total,
                            seasonInfo: `${format} ${year ? `(${year})` : ''}`,
                            externalRating: item.averageScore ? parseFloat((item.averageScore / 10).toFixed(1)) : 0,
                            source: 'AniList'
                        });
                    });
                }
            }

            if (unifiedResults.length === 0) {
                statusEl.textContent = 'No matches found. Try Manual Entry tab.';
                return;
            }

            statusEl.textContent = `Found ${unifiedResults.length} result(s): Click to select.`;
            resultsEl.classList.remove('hidden');
            resultsEl.innerHTML = unifiedResults.map(item => `
                <button type="button" onclick='app.selectFranchiseCatalogResult(${JSON.stringify(item)})' class="w-full flex items-center gap-3 p-2 rounded-xl border border-slate-800 bg-slate-950/80 hover:bg-slate-800 text-left transition-colors">
                    <img src="${this.escapeHTML(item.imageUrl || UIModule.SVG_POSTER_FALLBACK)}" onerror="this.src='${UIModule.SVG_POSTER_FALLBACK}';" class="w-10 h-14 object-cover rounded-lg bg-slate-900 shrink-0">
                    <div class="min-w-0 flex-1">
                        <h5 class="text-xs font-bold text-white truncate">${this.escapeHTML(item.titleEnglish)}</h5>
                        <p class="text-[10px] text-slate-400">${this.escapeHTML(item.seasonInfo)} · ${item.total} eps ${item.externalRating ? `· ★ ${item.externalRating}` : ''}</p>
                    </div>
                </button>
            `).join('');

        } catch (err) {
            if (err.name === 'AbortError') return;
            statusEl.textContent = 'Catalogue search failed.';
        }
    }

    selectFranchiseCatalogResult(item) {
        this.selectedCatalogAddEntry = item;
        document.getElementById('add-fe-selected-collection-id').value = '';
        document.getElementById('add-fe-selected-external-id').value = item.id;
        document.getElementById('add-fe-selected-kitsu-id').value = item.kitsuId || '';
        document.getElementById('add-fe-selected-anilist-id').value = item.anilistId || '';
        document.getElementById('add-fe-selected-rating').value = item.externalRating || 0;
        document.getElementById('add-fe-selected-source').value = item.source || 'Catalog';

        const notice = document.getElementById('add-fe-status-notice');
        notice.textContent = `Selected: "${item.titleEnglish}" (${item.seasonInfo})`;
        notice.classList.remove('hidden');
        document.getElementById('add-fe-catalog-results').classList.add('hidden');
    }

    submitAddFranchiseEntry() {
        const franchiseId = document.getElementById('add-fe-franchise-id').value;
        const franc = this.franchises.find(f => f.id === franchiseId);
        if (!franc) return;

        const classification = document.getElementById('add-fe-classification').value;
        let titleEnglish = '';
        let titleRomanji = '';
        let kitsuId = '';
        let anilistId = '';
        let externalId = '';
        let format = 'TV';
        let seasonInfo = 'TV';
        let totalProgress = 0;
        let externalRating = 0;
        let ratingSource = '';
        let coverUrl = '';
        let collectionId = null;

        if (this.addFranchiseTabMode === 'collection') {
            collectionId = document.getElementById('add-fe-selected-collection-id').value;
            if (!collectionId) {
                this.showToast('Please select an entry from your collection first.', 'error');
                return;
            }

            const colRec = this.entries.find(e => e.id === collectionId && (e.category || 'anime') === 'anime');
            if (!colRec) {
                this.showToast('That Collection entry could not be found.', 'error');
                return;
            }

            titleEnglish = colRec.titles?.english || colRec.titleEnglish || colRec.title || 'Untitled';
            titleRomanji = colRec.titles?.romanji || colRec.titleRomanji || titleEnglish;
            kitsuId = colRec.externalIds?.kitsu ? String(colRec.externalIds.kitsu) : '';
            anilistId = colRec.externalIds?.anilist ? String(colRec.externalIds.anilist) : '';
            externalId = kitsuId ? `kitsu-${kitsuId}` : (anilistId ? `anilist-${anilistId}` : '');
            format = colRec.season || 'TV';
            seasonInfo = colRec.season || 'TV';
            totalProgress = colRec.totalProgress || 0;
            externalRating = colRec.externalRating || 0;
            ratingSource = colRec.ratingSource || '';
            coverUrl = colRec.coverUrl || '';
        } else if (this.addFranchiseTabMode === 'catalog') {
            if (!this.selectedCatalogAddEntry) {
                this.showToast('Please search and select a title from the catalogue results.', 'error');
                return;
            }

            const catItem = this.selectedCatalogAddEntry;
            titleEnglish = catItem.titleEnglish || 'Untitled';
            titleRomanji = catItem.titleRomanji || titleEnglish;
            kitsuId = catItem.kitsuId ? String(catItem.kitsuId) : '';
            anilistId = catItem.anilistId ? String(catItem.anilistId) : '';
            externalId = catItem.id || (kitsuId ? `kitsu-${kitsuId}` : (anilistId ? `anilist-${anilistId}` : ''));
            format = catItem.seasonInfo || 'TV';
            seasonInfo = catItem.seasonInfo || 'TV';
            totalProgress = catItem.total || 0;
            externalRating = catItem.externalRating || 0;
            ratingSource = catItem.source || 'Catalog';
            coverUrl = catItem.imageUrl || '';

            // Check if user wants to also sync to collection or if it already exists
            const shouldSync = document.getElementById('add-fe-sync-collection').checked;
            const existingColMatch = CatalogueModule.findExistingMatch(this.entries, {
                kitsuId,
                anilistId,
                titles: { english: titleEnglish, romanji: titleRomanji },
                category: 'anime'
            });

            if (existingColMatch) {
                collectionId = existingColMatch.entry.id;
            } else if (shouldSync) {
                const newColRec = {
                    id: 'entry-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
                    internalId: 'entry-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
                    source: { provider: kitsuId ? 'kitsu' : (anilistId ? 'anilist' : 'catalog'), providerId: kitsuId || anilistId || null },
                    externalIds: { kitsu: kitsuId || null, anilist: anilistId || null },
                    titles: { english: titleEnglish, romanji: titleRomanji, alternatives: [] },
                    preferredTitleMode: 'english',
                    title: titleEnglish,
                    titleEnglish,
                    titleRomanji,
                    category: 'anime',
                    status: 'active',
                    currentProgress: 0,
                    totalProgress,
                    externalRating,
                    ratingSource,
                    ratingUpdatedAt: externalRating > 0 ? new Date().toISOString() : '',
                    season: seasonInfo,
                    coverUrl,
                    externalUrl: '',
                    updatedAt: Date.now()
                };
                this.entries.unshift(newColRec);
                this.saveEntriesToStorage();
                collectionId = newColRec.id;
            }
        } else if (this.addFranchiseTabMode === 'manual') {
            titleEnglish = document.getElementById('add-fe-title-english').value.trim();
            if (!titleEnglish) {
                this.showToast('Please enter an anime title.', 'error');
                return;
            }
            titleRomanji = document.getElementById('add-fe-title-romanji').value.trim() || titleEnglish;
            format = document.getElementById('add-fe-season-info').value.trim() || 'TV';
            seasonInfo = format;
            totalProgress = parseInt(document.getElementById('add-fe-total-progress').value) || 0;
            coverUrl = document.getElementById('add-fe-cover-url').value.trim();
            externalId = 'manual-' + Date.now();

            const shouldSync = document.getElementById('add-fe-sync-collection').checked;
            if (shouldSync) {
                const existingColMatch = CatalogueModule.findExistingMatch(this.entries, {
                    kitsuId: null,
                    anilistId: null,
                    titles: { english: titleEnglish, romanji: titleRomanji },
                    category: 'anime'
                });

                if (existingColMatch) {
                    collectionId = existingColMatch.entry.id;
                } else {
                    const newColRec = {
                        id: 'entry-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
                        internalId: 'entry-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
                        source: { provider: 'manual', providerId: null },
                        externalIds: { kitsu: null, anilist: null },
                        titles: { english: titleEnglish, romanji: titleRomanji, alternatives: [] },
                        preferredTitleMode: 'english',
                        title: titleEnglish,
                        titleEnglish,
                        titleRomanji,
                        category: 'anime',
                        status: 'active',
                        currentProgress: 0,
                        totalProgress,
                        externalRating: 0,
                        ratingSource: 'Manual',
                        ratingUpdatedAt: '',
                        season: seasonInfo,
                        coverUrl,
                        externalUrl: '',
                        updatedAt: Date.now()
                    };
                    this.entries.unshift(newColRec);
                    this.saveEntriesToStorage();
                    collectionId = newColRec.id;
                }
            }
        }

        // Prevent duplicate addition within this exact franchise watch order
        const normEng = UIModule.normalizeTitle(titleEnglish);
        const normRom = UIModule.normalizeTitle(titleRomanji);
        const alreadyInFranchise = franc.entries.some(e => {
            if (collectionId && (e.collectionId === collectionId || e.linkedCollectionId === collectionId)) return true;
            if (kitsuId && e.externalIds?.kitsu === kitsuId) return true;
            if (anilistId && e.externalIds?.anilist === anilistId) return true;
            const eEng = UIModule.normalizeTitle(e.titleEnglish);
            const eRom = UIModule.normalizeTitle(e.titleRomanji);
            return (normEng && eEng && normEng === eEng) || (normRom && eRom && normRom === eRom);
        });

        if (alreadyInFranchise) {
            this.showToast(`"${this.escapeHTML(titleEnglish)}" is already in this Watch Order.`, 'info');
            return;
        }

        const newFranchiseEntry = {
            id: 'fe-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
            externalId,
            externalIds: { kitsu: kitsuId || null, anilist: anilistId || null },
            titleEnglish,
            titleRomanji,
            category: 'anime',
            format,
            seasonInfo,
            totalProgress,
            externalRating,
            ratingSource,
            coverUrl,
            classification,
            collectionId,
            linkedCollectionId: collectionId,
            orderIndex: franc.entries.length
        };

        franc.entries.push(newFranchiseEntry);
        franc.entries.forEach((entry, index) => entry.orderIndex = index);
        this.saveFranchisesToStorage();
        this.closeModal('add-franchise-entry-modal');
        this.showToast(`Added "${this.escapeHTML(titleEnglish)}" to Watch Order!`, 'success');
        this.render();
    }

    async searchFranchiseWizard() {
        if (!navigator.onLine) {
            this.showToast('Franchise search requires internet connectivity.', 'error');
            return;
        }

        const query = document.getElementById('franchise-query-input').value.trim();
        const statusEl = document.getElementById('wizard-search-status');
        const resultsEl = document.getElementById('wizard-search-results');
        const searchBtn = document.getElementById('franchise-search-btn');

        if (query.length < 2) {
            statusEl.textContent = 'Enter at least 2 characters.';
            statusEl.classList.remove('hidden');
            return;
        }

        if (this.wizardAbortController) this.wizardAbortController.abort();
        this.wizardAbortController = new AbortController();

        searchBtn.disabled = true;
        searchBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Searching';
        statusEl.textContent = `Discovering related titles via ${this.preferredApiSource === 'anilist' ? 'AniList' : 'Kitsu'}…`;
        statusEl.classList.remove('hidden');
        resultsEl.innerHTML = '';
        resultsEl.classList.add('hidden');

        try {
            let discovered = [];
            if (this.preferredApiSource === 'kitsu') {
                const url = `https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(query)}&page[limit]=8`;
                const res = await fetch(url, { signal: this.wizardAbortController.signal });
                if (res.ok) {
                    const data = await res.json();
                    const items = Array.isArray(data.data) ? data.data : [];
                    items.forEach((item, idx) => {
                        const attr = item.attributes || {};
                        const kitsuId = String(item.id);
                        const titleEnglish = attr.titles?.en || attr.canonicalTitle || 'Untitled';
                        const titleRomanji = attr.titles?.en_jp || attr.canonicalTitle || titleEnglish;
                        const titleJapanese = attr.titles?.ja_jp || '';
                        const imageUrl = attr.posterImage?.medium || attr.posterImage?.original || '';
                        const year = attr.startDate ? attr.startDate.slice(0, 4) : '';
                        const total = attr.episodeCount || 0;
                        const subtype = attr.subtype ? attr.subtype.toUpperCase() : 'TV';
                        
                        let classification = idx === 0 ? 'Main story' : 'Optional extra';
                        if (subtype === 'MOVIE' || subtype === 'OVA') classification = 'Optional extra';

                        discovered.push({
                            externalId: 'kitsu-' + kitsuId,
                            externalIds: { kitsu: kitsuId, anilist: null },
                            titleEnglish,
                            titleRomanji,
                            titleJapanese,
                            category: 'anime',
                            format: subtype,
                            seasonInfo: `${subtype} ${year ? `(${year})` : ''}`,
                            totalProgress: total,
                            externalRating: attr.averageRating ? parseFloat((parseFloat(attr.averageRating) / 10).toFixed(1)) : 0,
                            ratingSource: 'Kitsu',
                            coverUrl: imageUrl,
                            classification,
                            collectionId: null,
                            linkedCollectionId: null,
                            orderIndex: idx
                        });
                    });
                }
            } else {
                const gqlQuery = `
                    query ($search: String) {
                        Page (perPage: 8) {
                            media (search: $search, type: ANIME) {
                                id
                                title { english romaji native }
                                coverImage { large medium }
                                episodes
                                seasonYear
                                format
                                averageScore
                            }
                        }
                    }
                `;
                const res = await fetch('https://graphql.anilist.co', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                    body: JSON.stringify({ query: gqlQuery, variables: { search: query } }),
                    signal: this.wizardAbortController.signal
                });
                if (res.ok) {
                    const payload = await res.json();
                    const mediaList = payload.data?.Page?.media || [];
                    mediaList.forEach((item, idx) => {
                        const anilistId = String(item.id);
                        const titleEnglish = item.title?.english || item.title?.romaji || 'Untitled';
                        const titleRomanji = item.title?.romaji || item.title?.english || titleEnglish;
                        const titleJapanese = item.title?.native || '';
                        const imageUrl = item.coverImage?.large || item.coverImage?.medium || '';
                        const total = item.episodes || 0;
                        const year = item.seasonYear ? String(item.seasonYear) : '';
                        const format = item.format ? item.format.replace(/_/g, ' ') : 'ANIME';

                        let classification = idx === 0 ? 'Main story' : 'Optional extra';
                        if (format.includes('MOVIE') || format.includes('OVA')) classification = 'Optional extra';

                        discovered.push({
                            externalId: 'anilist-' + anilistId,
                            externalIds: { kitsu: null, anilist: anilistId },
                            titleEnglish,
                            titleRomanji,
                            titleJapanese,
                            category: 'anime',
                            format,
                            seasonInfo: `${format} ${year ? `(${year})` : ''}`,
                            totalProgress: total,
                            externalRating: item.averageScore ? parseFloat((item.averageScore / 10).toFixed(1)) : 0,
                            ratingSource: 'AniList',
                            coverUrl: imageUrl,
                            classification,
                            collectionId: null,
                            linkedCollectionId: null,
                            orderIndex: idx
                        });
                    });
                }
            }

            if (discovered.length === 0) {
                statusEl.textContent = 'No titles found. You can add entries manually.';
                searchBtn.disabled = false;
                searchBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass mr-1"></i> Find Anime';
                return;
            }

            this.wizardDiscoveredEntries = discovered;
            document.getElementById('wizard-franchise-name').value = query.charAt(0).toUpperCase() + query.slice(1) + ' Franchise';
            document.getElementById('wizard-adaptation-status').value = 'unknown';
            this.renderWizardEntriesList();

            statusEl.textContent = `Discovered ${discovered.length} related entry/entries. Review below:`;
            document.getElementById('wizard-review-section').classList.remove('hidden');
            document.getElementById('wizard-save-btn').classList.remove('hidden');
            document.getElementById('wizard-entry-count-badge').textContent = `${discovered.length} items`;

        } catch (err) {
            if (err.name === 'AbortError') return;
            console.warn('Franchise wizard search failed', err);
            statusEl.textContent = 'Failed to fetch franchise data.';
        } finally {
            searchBtn.disabled = false;
            searchBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass mr-1"></i> Find Anime';
        }
    }

    renderWizardEntriesList() {
        const container = document.getElementById('wizard-entries-list');
        container.innerHTML = this.wizardDiscoveredEntries.map((item, idx) => `
            <div class="glass-card bg-slate-950/80 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border border-slate-800">
                <div class="flex items-center gap-3 min-w-0">
                    <img src="${this.escapeHTML(item.coverUrl || UIModule.SVG_POSTER_FALLBACK)}" onerror="this.src='${UIModule.SVG_POSTER_FALLBACK}';" class="w-10 h-14 object-cover rounded-lg bg-slate-900 shrink-0">
                    <div class="min-w-0">
                        <h5 class="text-xs font-bold text-white truncate">${this.escapeHTML(item.titleEnglish)}</h5>
                        <p class="text-[11px] text-slate-400">${this.escapeHTML(item.seasonInfo)} · ${item.totalProgress} eps</p>
                    </div>
                </div>
                <div class="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <select onchange="app.updateWizardClassification(${idx}, this.value)" class="bg-slate-900 border border-slate-800 text-[11px] text-slate-200 rounded-lg px-2.5 py-1.5 outline-none">
                        <option value="Main story" ${item.classification === 'Main story' ? 'selected' : ''}>Main Watch Order</option>
                        <option value="Optional extra" ${item.classification === 'Optional extra' ? 'selected' : ''}>Optional Extras</option>
                    </select>
                    <button type="button" onclick="app.removeWizardEntry(${idx})" class="p-1.5 text-rose-400 hover:text-white bg-rose-950/40 border border-rose-900/40 rounded-lg text-xs" title="Remove"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </div>
        `).join('');
    }

    updateWizardClassification(idx, classification) {
        if (this.wizardDiscoveredEntries[idx]) {
            this.wizardDiscoveredEntries[idx].classification = classification;
        }
    }

    removeWizardEntry(idx) {
        this.wizardDiscoveredEntries.splice(idx, 1);
        this.renderWizardEntriesList();
        document.getElementById('wizard-entry-count-badge').textContent = `${this.wizardDiscoveredEntries.length} items`;
    }

    saveNewFranchise() {
        const name = document.getElementById('wizard-franchise-name').value.trim() || 'New Franchise';
        const adaptationStatus = document.getElementById('wizard-adaptation-status').value || 'unknown';

        if (!this.wizardDiscoveredEntries.length) {
            this.showToast('Please include at least one entry in the franchise.', 'error');
            return;
        }

        const newFranchise = {
            id: 'franc-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
            name,
            coverUrl: this.wizardDiscoveredEntries[0].coverUrl || UIModule.SVG_POSTER_FALLBACK,
            provider: this.preferredApiSource === 'anilist' ? 'AniList' : 'Kitsu',
            orderType: 'Release Order',
            adaptationStatus,
            adaptationNotes: '',
            createdAt: Date.now(),
            entries: this.wizardDiscoveredEntries.map((e, index) => ({
                id: 'fe-' + Date.now() + '-' + index + '-' + Math.random().toString(36).substring(2, 4),
                ...e,
                orderIndex: index
            }))
        };

        this.franchises.push(newFranchise);
        this.saveFranchisesToStorage();
        this.closeModal('franchise-wizard-modal');
        this.showToast(`Created franchise "${this.escapeHTML(name)}"`, 'success');
        this.render();
    }

    openFranchiseDetail(franchiseId) {
        this.activeFranchiseId = franchiseId;
        document.getElementById('watch-order-search-wrapper').classList.add('hidden');
        this.render();
    }

    closeFranchiseDetail() {
        this.activeFranchiseId = null;
        document.getElementById('watch-order-search-wrapper').classList.remove('hidden');
        this.render();
    }

    openEditFranchiseModal(franchiseId, e) {
        if (e) e.stopPropagation();
        const franc = this.franchises.find(f => f.id === franchiseId);
        if (!franc) return;

        document.getElementById('edit-franc-id').value = franc.id;
        document.getElementById('edit-franc-name').value = franc.name;
        document.getElementById('edit-franc-adaptation-status').value = franc.adaptationStatus || 'unknown';
        document.getElementById('edit-franc-adaptation-notes').value = franc.adaptationNotes || '';

        this.openModal('edit-franchise-modal');
    }

    saveEditedFranchise(e) {
        e.preventDefault();
        const id = document.getElementById('edit-franc-id').value;
        const franc = this.franchises.find(f => f.id === id);
        if (!franc) return;

        franc.name = document.getElementById('edit-franc-name').value.trim() || franc.name;
        franc.adaptationStatus = document.getElementById('edit-franc-adaptation-status').value;
        franc.adaptationNotes = document.getElementById('edit-franc-adaptation-notes').value.trim();

        this.saveFranchisesToStorage();
        this.closeModal('edit-franchise-modal');
        this.showToast(`Updated "${this.escapeHTML(franc.name)}" metadata`, 'success');
        this.render();
    }

    openCoverFranchiseModal(franchiseId, e) {
        if (e) e.stopPropagation();
        const franc = this.franchises.find(f => f.id === franchiseId);
        if (!franc) return;

        document.getElementById('cover-franc-id').value = franc.id;
        document.getElementById('cover-franc-url-input').value = franc.coverUrl || '';
        
        const previewImg = document.getElementById('cover-modal-preview-img');
        previewImg.src = franc.coverUrl || UIModule.SVG_POSTER_FALLBACK;

        const optionsContainer = document.getElementById('cover-poster-options');
        if (franc.entries && franc.entries.length > 0) {
            optionsContainer.innerHTML = franc.entries.map((entry) => `
                <button type="button" onclick="app.selectFranchiseCoverOption('${this.escapeHTML(entry.coverUrl)}')" class="aspect-[2/3] rounded-lg overflow-hidden border border-slate-800 hover:border-cyber-cyan transition-colors bg-slate-900 group relative">
                    <img src="${this.escapeHTML(entry.coverUrl || UIModule.SVG_POSTER_FALLBACK)}" onerror="this.src='${UIModule.SVG_POSTER_FALLBACK}';" class="w-full h-full object-cover">
                    <span class="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 text-[9px] text-white flex items-center justify-center font-bold p-1 text-center">Use Title Poster</span>
                </button>
            `).join('');
        } else {
            optionsContainer.innerHTML = `<p class="col-span-4 text-xs text-slate-500 p-2 text-center">No associated titles available to select.</p>`;
        }

        this.openModal('cover-franchise-modal');
    }

    selectFranchiseCoverOption(url) {
        document.getElementById('cover-franc-url-input').value = url;
        this.updateFranchiseCoverModalPreview();
    }

    updateFranchiseCoverModalPreview() {
        const url = document.getElementById('cover-franc-url-input').value.trim();
        const previewImg = document.getElementById('cover-modal-preview-img');
        previewImg.src = url || UIModule.SVG_POSTER_FALLBACK;
    }

    saveFranchiseCoverImage() {
        const id = document.getElementById('cover-franc-id').value;
        const franc = this.franchises.find(f => f.id === id);
        if (!franc) return;

        const newUrl = document.getElementById('cover-franc-url-input').value.trim();
        franc.coverUrl = newUrl || franc.coverUrl || UIModule.SVG_POSTER_FALLBACK;

        this.saveFranchisesToStorage();
        this.closeModal('cover-franchise-modal');
        this.showToast('Updated franchise cover image', 'success');
        this.render();
    }

    deleteFranchise(franchiseId, e) {
        if (e) e.stopPropagation();
        const franc = this.franchises.find(f => f.id === franchiseId);
        if (!franc) return;

        this.showConfirmDialog(
            'Delete Franchise Watch Order',
            `Delete franchise "${this.escapeHTML(franc.name)}"? Your personal collection entries and viewing progress will remain safe in your library.`,
            () => {
                this.franchises = this.franchises.filter(f => f.id !== franchiseId);
                this.hiddenFranchiseIds = this.hiddenFranchiseIds.filter(id => id !== franchiseId);
                this.saveFranchisesToStorage();
                this.saveHiddenFranchisesToStorage();
                this.activeFranchiseId = null;
                this.showToast('Franchise deleted', 'info');
                this.render();
            }
        );
    }

    moveFranchiseEntryOrder(franchiseId, entryId, direction) {
        const franc = this.franchises.find(f => f.id === franchiseId);
        if (!franc) return;
        const idx = franc.entries.findIndex(e => e.id === entryId);
        if (idx === -1) return;
        const currentEntry = franc.entries[idx];
        const sameSection = franc.entries
            .map((entry, originalIndex) => ({ entry, originalIndex }))
            .filter(item => item.entry.classification === currentEntry.classification);
        const groupPosition = sameSection.findIndex(item => item.entry.id === entryId);
        const targetGroupPosition = direction === 'up' ? groupPosition - 1 : groupPosition + 1;
        if (targetGroupPosition < 0 || targetGroupPosition >= sameSection.length) return;
        const targetIdx = sameSection[targetGroupPosition].originalIndex;

        const container = document.getElementById('franchise-detail-container');
        const before = new Map();
        container?.querySelectorAll('[data-franchise-entry-id]').forEach(el => {
            before.set(el.dataset.franchiseEntryId, el.getBoundingClientRect());
        });

        [franc.entries[idx], franc.entries[targetIdx]] = [franc.entries[targetIdx], franc.entries[idx]];
        franc.entries.forEach((entry, i) => entry.orderIndex = i);
        this.saveFranchisesToStorage();
        this.render();

        const updatedContainer = document.getElementById('franchise-detail-container');
        const moved = [];
        updatedContainer?.querySelectorAll('[data-franchise-entry-id]').forEach(el => {
            const previous = before.get(el.dataset.franchiseEntryId);
            if (!previous) return;
            const current = el.getBoundingClientRect();
            const dx = previous.left - current.left;
            const dy = previous.top - current.top;
            if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
            el.style.transition = 'none';
            el.style.transform = `translate(${dx}px, ${dy}px)`;
            moved.push(el);
        });
        requestAnimationFrame(() => {
            moved.forEach(el => {
                el.style.transition = 'transform 280ms cubic-bezier(0.2, 0.75, 0.25, 1)';
                el.style.transform = '';
            });
        });
    }

    startFranchiseEntryDrag(event, franchiseId, entryId) {
        if (!event.dataTransfer) return;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', JSON.stringify({ franchiseId, entryId }));
        event.currentTarget.classList.add('opacity-50');
    }

    allowFranchiseEntryDrop(event) {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    }

    dropFranchiseEntry(event, franchiseId, targetEntryId) {
        event.preventDefault();
        let payload;
        try { payload = JSON.parse(event.dataTransfer?.getData('text/plain') || '{}'); } catch (_) { return; }
        if (!payload.entryId || payload.franchiseId !== franchiseId || payload.entryId === targetEntryId) return;
        const franc = this.franchises.find(f => f.id === franchiseId);
        if (!franc) return;
        const from = franc.entries.findIndex(e => e.id === payload.entryId);
        const to = franc.entries.findIndex(e => e.id === targetEntryId);
        if (from < 0 || to < 0) return;
        if (franc.entries[from].classification !== franc.entries[to].classification) return;
        const container = document.getElementById('franchise-detail-container');
        const before = new Map();
        container?.querySelectorAll('[data-franchise-entry-id]').forEach(el => before.set(el.dataset.franchiseEntryId, el.getBoundingClientRect()));
        const [item] = franc.entries.splice(from, 1);
        franc.entries.splice(to, 0, item);
        franc.entries.forEach((entry, i) => entry.orderIndex = i);
        this.saveFranchisesToStorage();
        this.render();
        const updatedContainer = document.getElementById('franchise-detail-container');
        const moved = [];
        updatedContainer?.querySelectorAll('[data-franchise-entry-id]').forEach(el => {
            const previous = before.get(el.dataset.franchiseEntryId);
            if (!previous) return;
            const current = el.getBoundingClientRect();
            const dx = previous.left - current.left, dy = previous.top - current.top;
            if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
            el.style.transition = 'none';
            el.style.transform = `translate(${dx}px, ${dy}px)`;
            moved.push(el);
        });
        requestAnimationFrame(() => moved.forEach(el => {
            el.style.transition = 'transform 280ms cubic-bezier(0.2, 0.75, 0.25, 1)';
            el.style.transform = '';
        }));
    }

    updateFranchiseEntryClassification(franchiseId, entryId, newClassification) {
        const franc = this.franchises.find(f => f.id === franchiseId);
        if (!franc) return;
        const entry = franc.entries.find(e => e.id === entryId);
        if (entry) {
            entry.classification = newClassification;
            this.saveFranchisesToStorage();
            this.render();
        }
    }

    setFranchiseEntryTitleOverride(franchiseId, entryId, mode) {
        const allowed = ['global', 'english', 'romanji'];
        if (!allowed.includes(mode)) return;
        const franc = this.franchises.find(f => f.id === franchiseId);
        const entry = franc?.entries?.find(e => e.id === entryId);
        if (!entry) return;
        entry.watchOrderTitleOverride = mode;
        this.saveFranchisesToStorage();
        this.render();
    }

    removeEntryFromFranchise(franchiseId, entryId) {
        const franc = this.franchises.find(f => f.id === franchiseId);
        if (!franc) return;

        const franchiseEntry = franc.entries.find(e => e.id === entryId);
        if (!franchiseEntry) return;

        const collectionId = franchiseEntry.collectionId || franchiseEntry.linkedCollectionId || null;
        const linkedCollectionEntry = collectionId
            ? this.entries.find(item => item.id === collectionId)
            : null;
        const title = this.getWatchOrderDisplayTitle(franchiseEntry, linkedCollectionEntry);

        const removeFromFranchise = () => {
            franc.entries = franc.entries.filter(e => e.id !== entryId);
            franc.entries.forEach((e, i) => e.orderIndex = i);
        };

        if (linkedCollectionEntry) {
            this.showConfirmDialog(
                'Delete from Franchise & Collection?',
                `"${this.escapeHTML(title)}" is also saved in My Collection. Confirm to delete it from both places. Any other franchise links to this collection entry will also be unlinked. Cancel to keep all data.`,
                () => {
                    this.entries = this.entries.filter(item => item.id !== collectionId);

                    this.franchises.forEach(f => {
                        f.entries.forEach(fe => {
                            if (fe.collectionId === collectionId || fe.linkedCollectionId === collectionId) {
                                fe.collectionId = null;
                                fe.linkedCollectionId = null;
                            }
                        });
                    });

                    removeFromFranchise();
                    this.saveEntriesToStorage();
                    this.saveFranchisesToStorage();
                    this.showToast(`Deleted "${this.escapeHTML(title)}" from Collection and Watch Order`, 'success');
                    this.render();
                }
            );
            return;
        }

        this.showConfirmDialog(
            'Remove from Franchise?',
            `Remove "${this.escapeHTML(title)}" from this Watch Order? It is not linked to a Collection entry, so your Collection will not be changed.`,
            () => {
                removeFromFranchise();
                this.saveFranchisesToStorage();
                this.showToast('Removed entry from franchise', 'info');
                this.render();
            }
        );
    }

    linkFranchiseEntryToCollection(franchiseId, franchiseEntryId) {
        const franc = this.franchises.find(f => f.id === franchiseId);
        if (!franc) return;
        const fEntry = franc.entries.find(e => e.id === franchiseEntryId);
        if (!fEntry) return;

        const match = CatalogueModule.findExistingMatch(this.entries, {
            kitsuId: fEntry.externalIds?.kitsu,
            anilistId: fEntry.externalIds?.anilist,
            titles: { english: fEntry.titleEnglish, romanji: fEntry.titleRomanji }
        });

        if (match) {
            fEntry.collectionId = match.entry.id;
            fEntry.linkedCollectionId = match.entry.id;
            this.saveFranchisesToStorage();
            this.showToast(`Linked to existing collection item "${this.escapeHTML(match.entry.titles?.english || match.entry.title)}"`, 'success');
            this.render();
        } else {
            const newCollectionRecord = {
                id: 'entry-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
                internalId: 'entry-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
                source: { provider: fEntry.externalIds?.kitsu ? 'kitsu' : 'catalog', providerId: fEntry.externalIds?.kitsu || null },
                externalIds: { kitsu: fEntry.externalIds?.kitsu || null, anilist: fEntry.externalIds?.anilist || null },
                titles: { english: fEntry.titleEnglish, romanji: fEntry.titleRomanji || fEntry.titleEnglish, japanese: '', alternatives: [] },
                preferredTitleMode: 'english',
                title: fEntry.titleEnglish,
                titleEnglish: fEntry.titleEnglish,
                titleRomanji: fEntry.titleRomanji || fEntry.titleEnglish,
                category: 'anime',
                status: 'active',
                currentProgress: 0,
                totalProgress: fEntry.totalProgress || 0,
                externalRating: fEntry.externalRating || 0,
                ratingSource: fEntry.ratingSource || 'Catalog',
                ratingUpdatedAt: new Date().toISOString(),
                season: fEntry.seasonInfo || '',
                coverUrl: fEntry.coverUrl || '',
                externalUrl: '',
                updatedAt: Date.now()
            };
            this.entries.unshift(newCollectionRecord);
            fEntry.collectionId = newCollectionRecord.id;
            fEntry.linkedCollectionId = newCollectionRecord.id;
            this.saveEntriesToStorage();
            this.saveFranchisesToStorage();
            this.showToast(`Added "${this.escapeHTML(fEntry.titleEnglish)}" to My Collection and linked!`, 'success');
            this.render();
        }
    }

    syncCollectionUpdatesToFranchises(updatedEntry) {
        this.franchises.forEach(f => {
            f.entries.forEach(fe => {
                if (fe.collectionId === updatedEntry.id || fe.linkedCollectionId === updatedEntry.id) {
                    fe.currentProgress = updatedEntry.currentProgress;
                    fe.status = updatedEntry.status;
                }
            });
        });
        this.saveFranchisesToStorage();
    }

    render() {
        this.renderStats();
        this.renderTabs();
        this.renderGrid();
    }

    renderStats() {
        const total = this.entries.length;
        const animeCnt = this.entries.filter(i => i.category === 'anime').length;
        const mangaCnt = this.entries.filter(i => i.category === 'manga').length;
        const activeCnt = this.entries.filter(i => i.status === 'active').length;
        const completedCnt = this.entries.filter(i => i.status === 'completed').length;

        document.getElementById('stat-total').textContent = total;
        document.getElementById('stat-anime-cnt').textContent = animeCnt;
        document.getElementById('stat-manga-cnt').textContent = mangaCnt;
        document.getElementById('stat-active').textContent = activeCnt;
        document.getElementById('stat-completed').textContent = completedCnt;

        document.getElementById('badge-anime-count').textContent = animeCnt;
        document.getElementById('badge-manga-count').textContent = mangaCnt;
        document.getElementById('badge-franchise-count').textContent = this.franchises.length;
    }

    renderTabs() {
        const animeTab = document.getElementById('cat-tab-anime');
        const mangaTab = document.getElementById('cat-tab-manga');
        const francTab = document.getElementById('cat-tab-franchise');

        const baseClass = "flex-1 min-w-0 lg:flex-initial flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3.5 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 text-slate-400 hover:text-white whitespace-nowrap shrink-0 sm:shrink";

        animeTab.className = baseClass;
        mangaTab.className = baseClass;
        francTab.className = baseClass;

        if (this.activeCategory === 'anime') {
            animeTab.className = "flex-1 min-w-0 lg:flex-initial flex items-center justify-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold transition-all duration-200 bg-brand-600 text-white shadow-lg shadow-brand-600/30 glow-cyan whitespace-nowrap shrink-0 sm:shrink";
        } else if (this.activeCategory === 'manga') {
            mangaTab.className = "flex-1 min-w-0 lg:flex-initial flex items-center justify-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold transition-all duration-200 bg-cyber-pink text-white shadow-lg shadow-pink-600/30 glow-pink whitespace-nowrap shrink-0 sm:shrink";
        } else if (this.activeCategory === 'franchise') {
            francTab.className = "flex-1 min-w-0 lg:flex-initial flex items-center justify-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm transition-all duration-200 bg-gradient-to-r from-cyber-cyan to-brand-500 text-slate-950 font-bold shadow-lg shadow-cyan-500/20 whitespace-nowrap shrink-0 sm:shrink";
        }

        ['all', 'active', 'completed'].forEach(st => {
            const el = document.getElementById(`status-tab-${st}`);
            if (this.activeStatus === st) {
                el.className = "px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-200 bg-slate-800 text-slate-100 border border-slate-700 shadow-sm";
            } else {
                el.className = "px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-200 text-slate-400 hover:text-white";
            }
        });

        document.getElementById('status-tab-active-label').textContent = this.activeCategory === 'anime' ? 'Watching' : 'Reading';
    }

    loadMoreEntries() {
        this.renderLimit += this.renderBatchSize;
        this.renderGrid();
    }

    renderGrid() {
        const grid = document.getElementById('media-grid');
        const emptyState = document.getElementById('empty-state');
        const loadMoreBtn = document.getElementById('load-more-container');
        const detailContainer = document.getElementById('franchise-detail-container');
        const woSearchWrapper = document.getElementById('watch-order-search-wrapper');

        if (this.activeCategory === 'franchise') {
            if (this.activeFranchiseId) {
                woSearchWrapper.classList.add('hidden');
                grid.classList.add('hidden');
                loadMoreBtn.classList.add('hidden');
                emptyState.classList.add('hidden');
                detailContainer.classList.remove('hidden');
                const franc = this.franchises.find(f => f.id === this.activeFranchiseId);
                FranchiseModule.renderFranchiseDetail(franc, this.entries, this.watchOrderTitleDisplayMode);
                return;
            } else {
                woSearchWrapper.classList.remove('hidden');
                detailContainer.classList.add('hidden');
                grid.classList.remove('hidden');
                
                const includeHidden = document.getElementById('include-hidden-franchises-checkbox')?.checked || false;

                const filteredFrancs = this.franchises.map(franc => {
                    const isHidden = this.hiddenFranchiseIds.includes(franc.id);
                    if (!includeHidden && isHidden) return null;
                    if (includeHidden && !isHidden && this.showHiddenFranchises) return null;

                    if (!this.watchOrderSearchQuery) {
                        return { franc, matchedTitle: null, isHidden };
                    }

                    const q = this.normalizeTitle(this.watchOrderSearchQuery);
                    const francNameMatch = this.normalizeTitle(franc.name).includes(q);
                    
                    let matchedEntryTitle = null;
                    const titleMatch = franc.entries.some(e => {
                        const eEng = this.normalizeTitle(e.titleEnglish);
                        const eRom = this.normalizeTitle(e.titleRomanji);
                        if (eEng.includes(q) || eRom.includes(q)) {
                            matchedEntryTitle = e.titleEnglish;
                            return true;
                        }
                        return false;
                    });

                    if (francNameMatch || titleMatch) {
                        return { franc, matchedTitle: matchedEntryTitle, isHidden };
                    }
                    return null;
                }).filter(Boolean);

                // Sort Watch Order Franchises
                filteredFrancs.sort((a, b) => {
                    const francA = a.franc;
                    const francB = b.franc;

                    if (this.watchOrderSortBy === 'complete_desc' || this.watchOrderSortBy === 'complete_asc') {
                        const progA = FranchiseModule.getFranchiseProgress(francA, this.entries).pct;
                        const progB = FranchiseModule.getFranchiseProgress(francB, this.entries).pct;
                        if (this.watchOrderSortBy === 'complete_desc') {
                            return progB - progA;
                        } else {
                            return progA - progB;
                        }
                    } else if (this.watchOrderSortBy === 'title_asc') {
                        return (francA.name || '').localeCompare(francB.name || '', undefined, { sensitivity: 'base' });
                    } else {
                        // Default: 'updated' (Recent updates)
                        const timeA = francA.updatedAt || francA.createdAt || 0;
                        const timeB = francB.updatedAt || francB.createdAt || 0;
                        return timeB - timeA;
                    }
                });

                if (filteredFrancs.length === 0) {
                    grid.innerHTML = '';
                    emptyState.classList.remove('hidden');
                    emptyState.classList.add('flex');
                    document.getElementById('empty-title').textContent = this.watchOrderSearchQuery ? 'No Matching Franchises' : 'No Franchises Found';
                    document.getElementById('empty-desc').textContent = this.watchOrderSearchQuery ? 'No franchise or title matched your search query.' : 'Create your first franchise watch order using the button above.';
                    document.getElementById('empty-action-btn').innerHTML = '<i class="fa-solid fa-plus text-xs"></i> Create Franchise';
                    document.getElementById('empty-action-btn').setAttribute('onclick', "app.openModal('franchise-wizard-modal')");
                    loadMoreBtn.classList.add('hidden');
                    return;
                }

                emptyState.classList.add('hidden');
                emptyState.classList.remove('flex');
                grid.innerHTML = filteredFrancs.map(item => FranchiseModule.createFranchiseCardHTML(item.franc, item.matchedTitle, item.isHidden, this.entries)).join('');
                loadMoreBtn.classList.add('hidden');
                return;
            }
        }

        woSearchWrapper.classList.add('hidden');
        detailContainer.classList.add('hidden');
        grid.classList.remove('hidden');

        const filtered = CollectionModule.getFilteredEntries(
            this.entries,
            this.activeCategory,
            this.activeStatus,
            this.searchQuery,
            this.sortBy,
            this.titleDisplayMode
        );

        if (filtered.length === 0) {
            grid.innerHTML = '';
            emptyState.classList.remove('hidden');
            emptyState.classList.add('flex');
            document.getElementById('empty-title').textContent = 'No Entries Found';
            document.getElementById('empty-desc').textContent = 'There are no items matching your filter or search query.';
            document.getElementById('empty-action-btn').innerHTML = '<i class="fa-solid fa-plus text-xs"></i> Add Entry Now';
            document.getElementById('empty-action-btn').setAttribute('onclick', "app.openModal('entry-modal')");
            loadMoreBtn.classList.add('hidden');
            return;
        }

        emptyState.classList.add('hidden');
        emptyState.classList.remove('flex');

        const itemsToDisplay = filtered.slice(0, this.renderLimit);
        grid.innerHTML = itemsToDisplay.map(item => CollectionModule.createCardHTML(item, this.titleDisplayMode, this.platforms)).join('');

        if (filtered.length > this.renderLimit) {
            loadMoreBtn.classList.remove('hidden');
        } else {
            loadMoreBtn.classList.add('hidden');
        }
    }

    handlePosterTap(entryId, e) {
        if (e.target.closest('button') || e.target.closest('a') || e.target.closest('input')) {
            return;
        }
        const card = document.getElementById(`anime-card-${entryId}`);
        if (!card) return;

        const isActive = card.classList.contains('active-overlay');
        document.querySelectorAll('.anime-card-item').forEach(c => c.classList.remove('active-overlay'));

        if (!isActive) {
            card.classList.add('active-overlay');
        }
        e.stopPropagation();
    }

    openPlatformFormModal(platformId = null) {
        const form = document.getElementById('platform-form');
        form.reset();
        document.getElementById('pf-url-error').classList.add('hidden');

        if (platformId) {
            const pf = this.platforms.find(p => p.id === platformId);
            if (pf) {
                document.getElementById('platform-form-title').innerHTML = `<i class="fa-solid fa-pen-to-square text-cyber-cyan"></i><span>Edit Custom Platform</span>`;
                document.getElementById('pf-id').value = pf.id;
                document.getElementById('pf-name').value = pf.name;
                document.getElementById('pf-url').value = pf.url;
                document.getElementById('pf-category').value = pf.category;
                document.getElementById('pf-icon').value = pf.icon || '';
                document.getElementById('pf-icon-url').value = pf.iconUrl || '';
                document.getElementById('pf-description').value = pf.description || '';
                document.getElementById('pf-enabled').checked = pf.enabled;
            }
        } else {
            document.getElementById('platform-form-title').innerHTML = `<i class="fa-solid fa-link text-cyber-cyan"></i><span>Add Custom Platform</span>`;
            document.getElementById('pf-id').value = '';
            document.getElementById('pf-enabled').checked = true;
        }

        this.openModal('platform-form-modal');
    }

    savePlatform(e) {
        e.preventDefault();
        const id = document.getElementById('pf-id').value;
        const name = document.getElementById('pf-name').value.trim();
        const url = document.getElementById('pf-url').value.trim();
        const category = document.getElementById('pf-category').value;
        const icon = document.getElementById('pf-icon').value.trim();
        const iconUrl = document.getElementById('pf-icon-url').value.trim();
        const description = document.getElementById('pf-description').value.trim();
        const enabled = document.getElementById('pf-enabled').checked;

        try {
            new URL(url);
        } catch {
            document.getElementById('pf-url-error').classList.remove('hidden');
            return;
        }

        if (id) {
            const index = this.platforms.findIndex(p => p.id === id);
            if (index !== -1) {
                this.platforms[index] = { ...this.platforms[index], name, url, category, icon, iconUrl, description, enabled };
                this.showToast(`Updated platform "${this.escapeHTML(name)}"`, 'success');
            }
        } else {
            const newPf = {
                id: 'pf-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
                name, url, category, icon: icon || 'fa-globe', iconUrl, description, enabled
            };
            this.platforms.push(newPf);
            this.showToast(`Added platform "${this.escapeHTML(name)}"`, 'success');
        }

        this.savePlatformsToStorage();
        this.closeModal('platform-form-modal');
        this.renderPlatformsList();
        this.renderGrid();
    }

    togglePlatformEnabled(id) {
        const pf = this.platforms.find(p => p.id === id);
        if (pf) {
            pf.enabled = !pf.enabled;
            this.savePlatformsToStorage();
            this.renderPlatformsList();
            this.renderGrid();
        }
    }

    confirmDeletePlatform(id) {
        const pf = this.platforms.find(p => p.id === id);
        if (!pf) return;

        this.showConfirmDialog(
            'Delete Platform',
            `Delete "${this.escapeHTML(pf.name)}"?`,
            () => {
                this.platforms = this.platforms.filter(p => p.id !== id);
                this.savePlatformsToStorage();
                this.renderPlatformsList();
                this.renderGrid();
            }
        );
    }

    saveDefaultPlatforms() {
        this.defaultPlatforms.anime = document.getElementById('default-anime-platform').value;
        this.defaultPlatforms.manga = document.getElementById('default-manga-platform').value;
        this.saveDefaultsToStorage();
        this.showToast('Default platform choices saved', 'success');
    }

    renderPlatformsList() {
        const container = document.getElementById('platforms-list-container');
        const search = (document.getElementById('platform-search')?.value || '').toLowerCase();
        const filtered = this.platforms.filter(p => p.name.toLowerCase().includes(search));

        const animeSelect = document.getElementById('default-anime-platform');
        const mangaSelect = document.getElementById('default-manga-platform');

        const animePlatforms = this.platforms.filter(p => p.enabled && (p.category === 'anime' || p.category === 'both'));
        const mangaPlatforms = this.platforms.filter(p => p.enabled && (p.category === 'manga' || p.category === 'both'));

        animeSelect.innerHTML = `<option value="">None</option>` + animePlatforms.map(p => `<option value="${p.id}" ${this.defaultPlatforms.anime === p.id ? 'selected' : ''}>${this.escapeHTML(p.name)}</option>`).join('');
        mangaSelect.innerHTML = `<option value="">None</option>` + mangaPlatforms.map(p => `<option value="${p.id}" ${this.defaultPlatforms.manga === p.id ? 'selected' : ''}>${this.escapeHTML(p.name)}</option>`).join('');

        container.innerHTML = filtered.map(pf => `
            <div class="glass-card bg-slate-950/90 rounded-xl p-3.5 flex items-center justify-between gap-3 border ${pf.enabled ? 'border-slate-800' : 'border-slate-900 opacity-60'}">
                <div class="flex items-center gap-3">
                    <i class="fa-solid ${this.escapeHTML(pf.icon || 'fa-globe')} text-cyber-cyan text-base"></i>
                    <div>
                        <h4 class="text-sm font-bold text-white">${this.escapeHTML(pf.name)}</h4>
                        <a href="${this.escapeHTML(pf.url)}" target="_blank" rel="noopener noreferrer" class="text-xs text-slate-400 hover:text-cyber-cyan truncate max-w-xs block">${this.escapeHTML(pf.url)}</a>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="app.togglePlatformEnabled('${pf.id}')" class="px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${pf.enabled ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-400'}">${pf.enabled ? 'Enabled' : 'Disabled'}</button>
                    <button onclick="app.openPlatformFormModal('${pf.id}')" class="p-1.5 text-slate-400 hover:text-white bg-slate-900 border border-slate-800 rounded-lg text-xs"><i class="fa-solid fa-pen-to-square"></i></button>
                    <button onclick="app.confirmDeletePlatform('${pf.id}')" class="p-1.5 text-rose-400 hover:text-rose-300 bg-rose-950/30 border border-rose-900/40 rounded-lg text-xs"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            </div>
        `).join('');
    }

    openMediaPlatformLink(entryId, platformUrl = null) {
        const entry = this.entries.find(e => e.id === entryId);
        if (!entry) return;

        if (entry.externalUrl) {
            window.open(entry.externalUrl, '_blank', 'noopener,noreferrer');
            return;
        }

        if (platformUrl) {
            window.open(platformUrl, '_blank', 'noopener,noreferrer');
            return;
        }

        const defaultId = entry.category === 'anime' ? this.defaultPlatforms.anime : this.defaultPlatforms.manga;
        const defaultPlatform = this.platforms.find(p => p.id === defaultId && p.enabled);

        if (defaultPlatform) {
            window.open(defaultPlatform.url, '_blank', 'noopener,noreferrer');
        } else {
            this.showToast('No default platform set.', 'info');
            this.openModal('platforms-modal');
        }
    }

    togglePlatformMenu(entryId, e) {
        if (e) e.stopPropagation();
        const menu = document.getElementById(`platform-menu-${entryId}`);
        if (!menu) return;
        document.querySelectorAll('.platform-dropdown-menu').forEach(m => {
            if (m !== menu) m.classList.add('hidden');
        });
        menu.classList.toggle('hidden');
    }

    toggleCardMenu(entryId, e) {
        if (e) e.stopPropagation();
        const menu = document.getElementById(`card-menu-${entryId}`);
        if (!menu) return;
        document.querySelectorAll('.card-action-menu').forEach(m => {
            if (m !== menu) m.classList.add('hidden');
        });
        menu.classList.toggle('hidden');
    }

    confirmReset() {
        this.showConfirmDialog(
            'Reset Storage Library',
            'DANGER: Permanently wipe all media entries, franchises, and settings?',
            () => {
                this.entries = [];
                this.franchises = [];
                this.hiddenFranchiseIds = [];
                this.platforms = StorageModule.getDefaultPlatforms();
                this.defaultPlatforms = { anime: '', manga: '' };
                StorageModule.resetAll();
                this.saveEntriesToStorage();
                this.saveFranchisesToStorage();
                this.saveHiddenFranchisesToStorage();
                this.savePlatformsToStorage();
                this.saveDefaultsToStorage();
                this.showToast('Library wiped to clean state', 'info');
                this.closeModal('data-modal');
                this.render();
            }
        );
    }

    exportWatchOrderJSON() {
        const backupData = {
            type: 'anitrack-watch-order-backup',
            version: 2,
            exportDate: new Date().toISOString().slice(0, 10),
            franchises: this.franchises,
            hiddenFranchiseIds: this.hiddenFranchiseIds,
            watchOrderTitleDisplayMode: this.watchOrderTitleDisplayMode
        };

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `anitrack_watch_order_backup_${new Date().toISOString().slice(0,10)}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        this.showToast('Watch Order dedicated backup downloaded!', 'success');
    }

    importWatchOrderJSON(e) {
        const file = e.target.files[0];
        if (!file) return;

        const mode = document.getElementById('watch-order-import-mode')?.value || 'merge';
        const reader = new FileReader();

        reader.onload = (event) => {
            try {
                const imported = JSON.parse(event.target.result);
                if (!imported || imported.type !== 'anitrack-watch-order-backup' || !Array.isArray(imported.franchises)) {
                    throw new Error('Invalid Watch Order backup format');
                }

                if (mode === 'replace') {
                    this.franchises = imported.franchises;
                    if (Array.isArray(imported.hiddenFranchiseIds)) {
                        this.hiddenFranchiseIds = imported.hiddenFranchiseIds;
                    }
                    if (['english', 'romanji', 'japanese'].includes(imported.watchOrderTitleDisplayMode)) {
                        this.watchOrderTitleDisplayMode = imported.watchOrderTitleDisplayMode;
                        StorageModule.saveWatchOrderTitleMode(this.watchOrderTitleDisplayMode);
                    }
                    this.showToast('Successfully replaced watch orders with backup!', 'success');
                } else {
                    let addedCount = 0;
                    imported.franchises.forEach(impFranc => {
                        const existingFranc = this.franchises.find(f => f.id === impFranc.id || f.name.toLowerCase() === impFranc.name.toLowerCase());
                        if (existingFranc) {
                            impFranc.entries.forEach(impEntry => {
                                const exists = existingFranc.entries.some(e => 
                                    (impEntry.externalIds?.kitsu && e.externalIds?.kitsu === impEntry.externalIds.kitsu) ||
                                    (impEntry.externalIds?.anilist && e.externalIds?.anilist === impEntry.externalIds.anilist) ||
                                    e.titleEnglish?.toLowerCase() === impEntry.titleEnglish?.toLowerCase()
                                );
                                if (!exists) {
                                    existingFranc.entries.push({
                                        ...impEntry,
                                        orderIndex: existingFranc.entries.length
                                    });
                                }
                            });
                        } else {
                            this.franchises.push(impFranc);
                            addedCount++;
                        }
                    });
                    this.showToast(`Watch Order Merge Complete: Added ${addedCount} new franchises.`, 'success');
                }

                this.saveFranchisesToStorage();
                this.saveHiddenFranchisesToStorage();
                this.closeModal('data-modal');
                this.render();
            } catch (err) {
                this.showToast('Invalid Watch Order JSON file format.', 'error');
            }
        };

        reader.readAsText(file);
        e.target.value = '';
    }

    exportJSON() {
        const catFilter = document.getElementById('export-category-filter')?.value || 'all';
        const statusFilter = document.getElementById('export-status-filter')?.value || 'all';

        let filteredEntries = this.entries.filter(item => {
            if (catFilter !== 'all' && item.category !== catFilter) return false;
            if (statusFilter !== 'all' && item.status !== statusFilter) return false;
            return true;
        });

        const backupData = {
            type: 'anitrack-full-backup',
            version: 2,
            exportDate: new Date().toISOString().slice(0, 10),
            data: {
                filterScope: { category: catFilter, status: statusFilter },
                anime: filteredEntries.filter(i => i.category === 'anime'),
                manga: filteredEntries.filter(i => i.category === 'manga'),
                franchises: this.franchises,
                hiddenFranchiseIds: this.hiddenFranchiseIds,
                watchOrderTitleDisplayMode: this.watchOrderTitleDisplayMode,
                platforms: this.platforms,
                defaultPlatforms: this.defaultPlatforms
            }
        };

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `anitrack_full_backup_${catFilter}_${statusFilter}_${new Date().toISOString().slice(0,10)}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();

        // Update auto-backup last execution date and reschedule
        if (this.autoBackupConfig) {
            const intervalDays = Number(this.autoBackupConfig.intervalDays) || 30;
            this.autoBackupConfig.lastBackupDate = Date.now();
            this.autoBackupConfig.nextBackupDate = Date.now() + (intervalDays * 24 * 60 * 60 * 1000);
            StorageModule.saveAutoBackupConfig(this.autoBackupConfig);
            this.updateAutoBackupUI();
        }

        this.showToast('Full AniTrack v2 backup downloaded!', 'success');
    }

    importJSON(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const imported = JSON.parse(event.target.result);
                let validEntries = [];
                
                if (Array.isArray(imported)) {
                    validEntries = imported;
                } else if (imported && imported.type === 'anitrack-full-backup' && imported.data) {
                    const d = imported.data;
                    validEntries = [...(d.anime || []), ...(d.manga || [])];
                    if (d.franchises && Array.isArray(d.franchises)) this.franchises = d.franchises;
                    if (d.hiddenFranchiseIds && Array.isArray(d.hiddenFranchiseIds)) this.hiddenFranchiseIds = d.hiddenFranchiseIds;
                    if (d.platforms) this.platforms = d.platforms;
                    if (d.defaultPlatforms) this.defaultPlatforms = d.defaultPlatforms;
                } else if (imported && imported.entries && Array.isArray(imported.entries)) {
                    validEntries = imported.entries;
                    if (imported.franchises) this.franchises = imported.franchises;
                } else {
                    throw new Error('Invalid schema');
                }

                this.entries = validEntries.map(item => ({
                    id: item.id || ('entry-' + Math.random().toString(36).substring(2, 9)),
                    internalId: item.internalId || item.id,
                    source: item.source || { provider: 'import', providerId: null },
                    externalIds: { kitsu: item.externalIds?.kitsu || null, anilist: item.externalIds?.anilist || null },
                    titles: {
                        english: item.titles?.english || item.titleEnglish || item.title || 'Untitled',
                        romanji: item.titles?.romanji || item.titleRomanji || item.title || 'Untitled',
                        japanese: item.titles?.japanese || '',
                        alternatives: item.titles?.alternatives || []
                    },
                    preferredTitleMode: item.preferredTitleMode || 'english',
                    title: item.title || item.titleEnglish || 'Untitled',
                    titleEnglish: item.titleEnglish || item.title || 'Untitled',
                    titleRomanji: item.titleRomanji || item.title || 'Untitled',
                    category: item.category || 'anime',
                    status: item.status || 'active',
                    currentProgress: item.currentProgress || 0,
                    totalProgress: item.totalProgress || 0,
                    externalRating: item.externalRating || 0,
                    ratingSource: item.ratingSource || 'Catalog',
                    ratingUpdatedAt: item.ratingUpdatedAt || '',
                    season: item.season || '',
                    coverUrl: item.coverUrl || '',
                    externalUrl: item.externalUrl || '',
                    updatedAt: item.updatedAt || Date.now()
                }));

                this.saveEntriesToStorage();
                this.saveFranchisesToStorage();
                this.saveHiddenFranchisesToStorage();
                this.savePlatformsToStorage();
                this.saveDefaultsToStorage();

                this.showToast('Successfully restored Full Backup v2!', 'success');
                this.closeModal('data-modal');
                this.render();
            } catch (err) {
                this.showToast('Invalid backup JSON file format.', 'error');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    }

    importMAL(e) {
        const file = e.target.files[0];
        if (!file) return;

        const strategy = document.getElementById('mal-duplicate-strategy')?.value || 'skip';
        const reader = new FileReader();

        reader.onload = (event) => {
            try {
                const xmlText = event.target.result;
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
                
                const parseError = xmlDoc.querySelector('parsererror');
                if (parseError) throw new Error('Invalid XML format');

                let addedCount = 0;
                let updatedCount = 0;
                let skippedCount = 0;

                const getNodeText = (parent, tag) => {
                    const el = parent.querySelector(tag);
                    return el ? el.textContent.trim() : '';
                };

                const processEntries = (nodes, category) => {
                    nodes.forEach(node => {
                        const title = getNodeText(node, category === 'anime' ? 'series_title' : 'manga_title');
                        if (!title) return;

                        const malId = getNodeText(node, category === 'anime' ? 'series_animedb_id' : 'manga_mangadb_id');
                        const statusRaw = getNodeText(node, category === 'anime' ? 'my_status' : 'my_status').toLowerCase();
                        const currentProg = parseInt(getNodeText(node, category === 'anime' ? 'my_watched_episodes' : 'my_read_chapters')) || 0;
                        const totalProg = parseInt(getNodeText(node, category === 'anime' ? 'series_episodes' : 'manga_volumes')) || 0;
                        const type = getNodeText(node, category === 'anime' ? 'series_type' : 'manga_publishing_status');
                        const startDate = getNodeText(node, 'my_start_date');

                        let status = 'active';
                        if (statusRaw.includes('completed') || (totalProg > 0 && currentProg >= totalProg)) {
                            status = 'completed';
                        }

                        let season = type ? type.toUpperCase() : (category === 'anime' ? 'TV' : 'MANGA');
                        if (startDate && startDate !== '0000-00-00') {
                            season += ` (${startDate.slice(0, 4)})`;
                        }

                        const entryData = {
                            id: category + '-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
                            internalId: category + '-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
                            source: { provider: 'mal', providerId: malId || null },
                            externalIds: { kitsu: null, anilist: null },
                            titles: { english: title, romanji: title, japanese: '', alternatives: [] },
                            preferredTitleMode: 'english',
                            title,
                            titleEnglish: title,
                            titleRomanji: title,
                            category,
                            status,
                            currentProgress: currentProg,
                            totalProgress: totalProg,
                            externalRating: 0,
                            ratingSource: '',
                            ratingUpdatedAt: '',
                            season,
                            coverUrl: '',
                            externalUrl: '',
                            updatedAt: Date.now()
                        };

                        const existingIndex = this.entries.findIndex(item => 
                            item.titles?.english?.toLowerCase() === title.toLowerCase() ||
                            item.titleEnglish?.toLowerCase() === title.toLowerCase()
                        );

                        if (existingIndex !== -1) {
                            if (strategy === 'skip') {
                                skippedCount++;
                            } else if (strategy === 'update') {
                                this.entries[existingIndex] = {
                                    ...this.entries[existingIndex],
                                    currentProgress: currentProg,
                                    totalProgress: totalProg,
                                    status,
                                    updatedAt: Date.now()
                                };
                                updatedCount++;
                            } else if (strategy === 'import') {
                                this.entries.unshift(entryData);
                                addedCount++;
                            }
                        } else {
                            this.entries.unshift(entryData);
                            addedCount++;
                        }
                    });
                };

                processEntries(xmlDoc.querySelectorAll('anime'), 'anime');
                processEntries(xmlDoc.querySelectorAll('manga'), 'manga');

                this.saveEntriesToStorage();
                this.showToast(`MAL Import Complete: Added ${addedCount}, Updated ${updatedCount}, Skipped ${skippedCount}`, 'success');
                this.closeModal('data-modal');
                this.render();
            } catch (err) {
                this.showToast('Failed to parse MyAnimeList XML file.', 'error');
            }
        };

        reader.readAsText(file);
        e.target.value = '';
    }

    // ==========================================
    // Automatic Backup Schedule & Confirmation
    // ==========================================

    checkAutoBackupSchedule() {
        this.autoBackupConfig = StorageModule.loadAutoBackupConfig();
        if (!this.autoBackupConfig || !this.autoBackupConfig.enabled) return;

        const now = Date.now();
        if (this.autoBackupConfig.nextBackupDate && now >= this.autoBackupConfig.nextBackupDate) {
            setTimeout(() => {
                this.showAutoBackupPrompt();
            }, 1200);
        }
    }

    showAutoBackupPrompt() {
        const modal = document.getElementById('auto-backup-prompt-modal');
        if (!modal) return;
        const dateStr = this.autoBackupConfig && this.autoBackupConfig.lastBackupDate 
            ? new Date(this.autoBackupConfig.lastBackupDate).toLocaleDateString() 
            : 'Never';
        const lastEl = document.getElementById('auto-backup-prompt-last-date');
        if (lastEl) lastEl.textContent = dateStr;
        this.openModal('auto-backup-prompt-modal');
    }

    performAutoBackupDownload() {
        this.exportJSON();
        this.closeModal('auto-backup-prompt-modal');
        this.showToast('Automatic backup completed! Next backup reminder scheduled.', 'success');
    }

    remindAutoBackupLater() {
        if (!this.autoBackupConfig) this.autoBackupConfig = StorageModule.loadAutoBackupConfig();
        // Postpone by 24 hours
        this.autoBackupConfig.nextBackupDate = Date.now() + (24 * 60 * 60 * 1000);
        StorageModule.saveAutoBackupConfig(this.autoBackupConfig);
        this.closeModal('auto-backup-prompt-modal');
        this.updateAutoBackupUI();
        this.showToast('Backup reminder postponed for 24 hours.', 'info');
    }

    updateAutoBackupUI() {
        this.autoBackupConfig = StorageModule.loadAutoBackupConfig();
        const enabledToggle = document.getElementById('auto-backup-enabled-toggle');
        const intervalSelect = document.getElementById('auto-backup-interval-select');
        const customDaysContainer = document.getElementById('auto-backup-custom-days-container');
        const customDaysInput = document.getElementById('auto-backup-custom-days-input');
        const datetimeInput = document.getElementById('auto-backup-datetime-input');
        const nextDueLabel = document.getElementById('auto-backup-next-due-label');
        const lastBackupLabel = document.getElementById('auto-backup-last-date-label');

        if (!enabledToggle || !intervalSelect) return;

        enabledToggle.checked = !!this.autoBackupConfig.enabled;

        const days = this.autoBackupConfig.intervalDays || 30;
        if ([7, 14, 30, 60, 90].includes(days)) {
            intervalSelect.value = String(days);
            if (customDaysContainer) customDaysContainer.classList.add('hidden');
        } else {
            intervalSelect.value = 'custom';
            if (customDaysContainer) customDaysContainer.classList.remove('hidden');
            if (customDaysInput) customDaysInput.value = days;
        }

        if (datetimeInput && this.autoBackupConfig.nextBackupDate) {
            const d = new Date(this.autoBackupConfig.nextBackupDate);
            const pad = (n) => String(n).padStart(2, '0');
            datetimeInput.value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        }

        if (nextDueLabel) {
            nextDueLabel.textContent = this.autoBackupConfig.nextBackupDate 
                ? new Date(this.autoBackupConfig.nextBackupDate).toLocaleString() 
                : 'Not scheduled';
        }

        if (lastBackupLabel) {
            lastBackupLabel.textContent = this.autoBackupConfig.lastBackupDate 
                ? new Date(this.autoBackupConfig.lastBackupDate).toLocaleString() 
                : 'Never';
        }
    }

    handleAutoBackupIntervalChange() {
        const intervalSelect = document.getElementById('auto-backup-interval-select');
        const customDaysContainer = document.getElementById('auto-backup-custom-days-container');
        const customDaysInput = document.getElementById('auto-backup-custom-days-input');
        const datetimeInput = document.getElementById('auto-backup-datetime-input');

        if (!intervalSelect) return;

        if (intervalSelect.value === 'custom') {
            if (customDaysContainer) customDaysContainer.classList.remove('hidden');
            const customVal = Math.max(1, parseInt(customDaysInput?.value) || 30);
            const targetTime = Date.now() + (customVal * 24 * 60 * 60 * 1000);
            const d = new Date(targetTime);
            const pad = (n) => String(n).padStart(2, '0');
            if (datetimeInput) {
                datetimeInput.value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
            }
        } else {
            if (customDaysContainer) customDaysContainer.classList.add('hidden');
            const days = parseInt(intervalSelect.value) || 30;
            const targetTime = Date.now() + (days * 24 * 60 * 60 * 1000);
            const d = new Date(targetTime);
            const pad = (n) => String(n).padStart(2, '0');
            if (datetimeInput) {
                datetimeInput.value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
            }
        }
    }

    saveAutoBackupSettingsFromUI() {
        const enabledToggle = document.getElementById('auto-backup-enabled-toggle');
        const intervalSelect = document.getElementById('auto-backup-interval-select');
        const customDaysInput = document.getElementById('auto-backup-custom-days-input');
        const datetimeInput = document.getElementById('auto-backup-datetime-input');

        if (!enabledToggle || !intervalSelect) return;

        if (!this.autoBackupConfig) this.autoBackupConfig = StorageModule.loadAutoBackupConfig();

        let days = intervalSelect.value === 'custom' 
            ? Math.max(1, parseInt(customDaysInput?.value) || 30) 
            : parseInt(intervalSelect.value) || 30;

        let nextTimestamp = this.autoBackupConfig.nextBackupDate;
        if (datetimeInput && datetimeInput.value) {
            const parsed = new Date(datetimeInput.value).getTime();
            if (!isNaN(parsed) && parsed > 0) {
                nextTimestamp = parsed;
            }
        } else {
            nextTimestamp = Date.now() + (days * 24 * 60 * 60 * 1000);
        }

        this.autoBackupConfig.enabled = enabledToggle.checked;
        this.autoBackupConfig.intervalDays = days;
        this.autoBackupConfig.nextBackupDate = nextTimestamp;

        StorageModule.saveAutoBackupConfig(this.autoBackupConfig);
        this.updateAutoBackupUI();
        this.showToast('Automatic backup schedule saved successfully!', 'success');
    }
}

// Global App Initialization
let app;
window.addEventListener('DOMContentLoaded', () => {
    app = new AniTrackApp();
    window.app = app;
});
