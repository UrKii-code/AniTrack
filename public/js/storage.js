/**
 * AniTrack - Storage Module (js/storage.js)
 * Manages saving, loading, schema upgrades, seeds, and backup import/export
 */

const StorageModule = {
    KEYS: {
        STORAGE_KEY: 'anitrack_library_v1',
        FRANCHISES_KEY: 'anitrack_franchises_v1',
        PLATFORMS_KEY: 'anitrack_platforms_v1',
        DEFAULTS_KEY: 'anitrack_defaults_v1',
        PREFERRED_SOURCE_KEY: 'anitrackPreferredMetadataSource',
        HIDDEN_FRANCHISES_KEY: 'anitrack_hidden_franchises_v1',
        WATCH_ORDER_TITLE_MODE_KEY: 'anitrack_watch_order_title_mode_v1'
    },

    getDefaultPlatforms() {
        return [
            { id: 'pf-crunchyroll', name: 'Crunchyroll', url: 'https://www.crunchyroll.com', category: 'anime', icon: 'fa-play', enabled: true },
            { id: 'pf-netflix', name: 'Netflix', url: 'https://www.netflix.com', category: 'anime', icon: 'fa-tv', enabled: true },
            { id: 'pf-mangaplus', name: 'MangaPlus', url: 'https://mangaplus.shueisha.co.jp', category: 'manga', icon: 'fa-book-open', enabled: true },
            { id: 'pf-viz', name: 'VIZ Media', url: 'https://www.viz.com', category: 'manga', icon: 'fa-book', enabled: true }
        ];
    },

    getDefaultSeedData() {
        return [
            {
                id: 'demo-1',
                internalId: 'demo-1',
                source: { provider: 'kitsu', providerId: '1' },
                externalIds: { kitsu: '1', anilist: null },
                titles: { english: 'Cowboy Bebop', romanji: 'Cowboy Bebop', japanese: 'カウボーイビバップ', alternatives: [] },
                preferredTitleMode: 'english',
                title: 'Cowboy Bebop',
                titleEnglish: 'Cowboy Bebop',
                titleRomanji: 'Cowboy Bebop',
                category: 'anime',
                status: 'completed',
                currentProgress: 26,
                totalProgress: 26,
                externalRating: 8.7,
                ratingSource: 'Kitsu',
                season: 'TV',
                coverUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=500&auto=format&fit=crop&q=80',
                externalUrl: 'https://www.crunchyroll.com',
                updatedAt: Date.now() - 100000000
            }
        ];
    },

    getDefaultFranchisesSeed() {
        return [
            {
                id: 'franc-1',
                name: 'Cowboy Bebop Franchise',
                coverUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=500&auto=format&fit=crop&q=80',
                provider: 'Kitsu',
                orderType: 'Release Order',
                adaptationStatus: 'anime_original',
                adaptationNotes: 'Original television anime series',
                createdAt: Date.now(),
                entries: [
                    {
                        id: 'fe-1',
                        externalId: 'kitsu-1',
                        externalIds: { kitsu: '1', anilist: null },
                        titleEnglish: 'Cowboy Bebop',
                        titleRomanji: 'Cowboy Bebop',
                        category: 'anime',
                        format: 'TV',
                        seasonInfo: 'TV (1998)',
                        totalProgress: 26,
                        externalRating: 8.7,
                        ratingSource: 'Kitsu',
                        coverUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=500&auto=format&fit=crop&q=80',
                        classification: 'Main story',
                        collectionId: 'demo-1',
                        orderIndex: 0
                    }
                ]
            }
        ];
    },

    loadAll(appInstance) {
        try {
            const storedEntries = localStorage.getItem(this.KEYS.STORAGE_KEY);
            if (storedEntries) {
                const parsed = JSON.parse(storedEntries);
                appInstance.entries = parsed.map(item => ({
                    id: item.id || ('entry-' + Math.random().toString(36).substring(2, 9)),
                    internalId: item.internalId || item.id || ('entry-' + Math.random().toString(36).substring(2, 9)),
                    source: item.source || { provider: item.externalId?.startsWith('anilist') ? 'anilist' : 'kitsu', providerId: item.externalId || null },
                    externalIds: {
                        kitsu: item.externalIds?.kitsu || (item.externalId?.startsWith('kitsu-') ? item.externalId.replace('kitsu-', '') : null),
                        anilist: item.externalIds?.anilist || (item.externalId?.startsWith('anilist-') ? item.externalId.replace('anilist-', '') : null)
                    },
                    titles: {
                        english: item.titles?.english || item.titleEnglish || item.title || 'Untitled',
                        romanji: item.titles?.romanji || item.titleRomanji || item.title || 'Untitled',
                        japanese: item.titles?.japanese || '',
                        alternatives: Array.isArray(item.titles?.alternatives) ? item.titles.alternatives : []
                    },
                    preferredTitleMode: item.preferredTitleMode || 'english',
                    title: item.title || item.titleEnglish || 'Untitled',
                    titleEnglish: item.titleEnglish || item.title || 'Untitled',
                    titleRomanji: item.titleRomanji || item.title || 'Untitled',
                    category: item.category || 'anime',
                    status: item.status || 'active',
                    currentProgress: item.currentProgress || 0,
                    totalProgress: item.totalProgress || 0,
                    externalRating: item.source?.provider === 'mal' ? 0 : (item.externalRating || 0),
                    ratingSource: item.source?.provider === 'mal' ? '' : (item.ratingSource || 'Catalog'),
                    ratingUpdatedAt: item.ratingUpdatedAt || '',
                    season: item.season || '',
                    coverUrl: item.coverUrl || '',
                    externalUrl: item.externalUrl || '',
                    updatedAt: item.updatedAt || Date.now()
                }));
            } else {
                appInstance.entries = this.getDefaultSeedData();
                this.saveEntries(appInstance.entries);
            }

            const storedFranchises = localStorage.getItem(this.KEYS.FRANCHISES_KEY);
            if (storedFranchises) {
                const parsed = JSON.parse(storedFranchises);
                appInstance.franchises = parsed.map(franc => ({
                    ...franc,
                    adaptationStatus: franc.adaptationStatus || 'unknown',
                    adaptationNotes: franc.adaptationNotes || '',
                    entries: (franc.entries || []).map(fe => ({
                        ...fe,
                        classification: fe.classification === 'Optional extra' ? 'Optional extra' : 'Main story',
                        collectionId: fe.collectionId || fe.linkedCollectionId || null,
                        titles: {
                            english: fe.titles?.english || fe.titleEnglish || fe.title || '',
                            romanji: fe.titles?.romanji || fe.titleRomanji || '',
                            japanese: fe.titles?.japanese || fe.titleJapanese || '',
                            alternatives: Array.isArray(fe.titles?.alternatives) ? fe.titles.alternatives : []
                        },
                        titleEnglish: fe.titleEnglish || fe.titles?.english || fe.title || '',
                        titleRomanji: fe.titleRomanji || fe.titles?.romanji || '',
                        titleJapanese: fe.titleJapanese || fe.titles?.japanese || '',
                        watchOrderTitleOverride: fe.watchOrderTitleOverride || 'global',
                        externalIds: {
                            kitsu: fe.externalIds?.kitsu || (fe.externalId?.startsWith('kitsu-') ? fe.externalId.replace('kitsu-', '') : null),
                            anilist: fe.externalIds?.anilist || (fe.externalId?.startsWith('anilist-') ? fe.externalId.replace('anilist-', '') : null)
                        }
                    }))
                }));
            } else {
                appInstance.franchises = this.getDefaultFranchisesSeed();
                this.saveFranchises(appInstance.franchises);
            }

            const storedHidden = localStorage.getItem(this.KEYS.HIDDEN_FRANCHISES_KEY);
            if (storedHidden) {
                appInstance.hiddenFranchiseIds = JSON.parse(storedHidden);
            }

            const storedPlatforms = localStorage.getItem(this.KEYS.PLATFORMS_KEY);
            if (storedPlatforms) {
                appInstance.platforms = JSON.parse(storedPlatforms);
            } else {
                appInstance.platforms = this.getDefaultPlatforms();
                this.savePlatforms(appInstance.platforms);
            }

            const storedDefaults = localStorage.getItem(this.KEYS.DEFAULTS_KEY);
            if (storedDefaults) {
                appInstance.defaultPlatforms = JSON.parse(storedDefaults);
            } else {
                appInstance.defaultPlatforms = { anime: 'pf-crunchyroll', manga: 'pf-mangaplus' };
                this.saveDefaults(appInstance.defaultPlatforms);
            }

            const storedSource = localStorage.getItem(this.KEYS.PREFERRED_SOURCE_KEY);
            if (storedSource === 'kitsu' || storedSource === 'anilist') {
                appInstance.preferredApiSource = storedSource;
            } else {
                appInstance.preferredApiSource = 'kitsu';
                localStorage.setItem(this.KEYS.PREFERRED_SOURCE_KEY, 'kitsu');
            }

            const storedWatchOrderTitleMode = localStorage.getItem(this.KEYS.WATCH_ORDER_TITLE_MODE_KEY);
            if (['english', 'romanji'].includes(storedWatchOrderTitleMode)) {
                appInstance.watchOrderTitleDisplayMode = storedWatchOrderTitleMode;
            } else {
                appInstance.watchOrderTitleDisplayMode = 'english';
                localStorage.setItem(this.KEYS.WATCH_ORDER_TITLE_MODE_KEY, appInstance.watchOrderTitleDisplayMode);
            }
        } catch (e) {
            console.error('Failed to load from localStorage', e);
            appInstance.entries = [];
            appInstance.franchises = [];
            appInstance.platforms = this.getDefaultPlatforms();
            appInstance.preferredApiSource = 'kitsu';
        }
    },

    saveEntries(entries) {
        try {
            localStorage.setItem(this.KEYS.STORAGE_KEY, JSON.stringify(entries));
        } catch (e) {
            if (window.UIModule) UIModule.showToast('Failed to save library data.', 'error');
        }
    },

    saveFranchises(franchises) {
        try {
            localStorage.setItem(this.KEYS.FRANCHISES_KEY, JSON.stringify(franchises));
        } catch (e) {
            if (window.UIModule) UIModule.showToast('Failed to save franchise data.', 'error');
        }
    },

    saveHiddenFranchises(hiddenFranchiseIds) {
        try {
            localStorage.setItem(this.KEYS.HIDDEN_FRANCHISES_KEY, JSON.stringify(hiddenFranchiseIds));
        } catch (e) {
            console.error('Failed to save hidden franchises', e);
        }
    },

    savePlatforms(platforms) {
        try {
            localStorage.setItem(this.KEYS.PLATFORMS_KEY, JSON.stringify(platforms));
        } catch (e) {
            if (window.UIModule) UIModule.showToast('Failed to save custom platforms.', 'error');
        }
    },

    saveDefaults(defaultPlatforms) {
        try {
            localStorage.setItem(this.KEYS.DEFAULTS_KEY, JSON.stringify(defaultPlatforms));
        } catch (e) {
            console.error('Failed to save default platforms', e);
        }
    },

    savePreferredSource(source) {
        localStorage.setItem(this.KEYS.PREFERRED_SOURCE_KEY, source);
    },

    saveWatchOrderTitleMode(mode) {
        localStorage.setItem(this.KEYS.WATCH_ORDER_TITLE_MODE_KEY, mode);
    },

    resetAll() {
        localStorage.removeItem(this.KEYS.STORAGE_KEY);
        localStorage.removeItem(this.KEYS.FRANCHISES_KEY);
        localStorage.removeItem(this.KEYS.HIDDEN_FRANCHISES_KEY);
        localStorage.removeItem(this.KEYS.PLATFORMS_KEY);
        localStorage.removeItem(this.KEYS.DEFAULTS_KEY);
    }
};

window.StorageModule = StorageModule;
