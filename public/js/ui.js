/**
 * AniTrack - UI Module (js/ui.js)
 * Modals, notifications, toast messages, confirmation dialogs, and rendering helpers
 */

const UIModule = {
    SVG_POSTER_FALLBACK: "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'%3E%3Crect width='100%25' height='100%25' fill='%230f172a'/%3E%3Ctext x='50%25' y='48%25' dominant-baseline='middle' text-anchor='middle' fill='%23475569' font-family='sans-serif' font-size='14' font-weight='bold'%3ENo Cover Image%3C/text%3E%3C/svg%3E",

    escapeHTML(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    normalizeTitle(str) {
        if (!str) return '';
        return String(str)
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\w\s]/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    },

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        
        let iconClass = 'fa-circle-info text-cyan-400';
        let borderColor = 'border-cyan-500/30';
        
        if (type === 'success') {
            iconClass = 'fa-circle-check text-emerald-400';
            borderColor = 'border-emerald-500/30';
        } else if (type === 'error') {
            iconClass = 'fa-circle-exclamation text-rose-400';
            borderColor = 'border-rose-500/30';
        }

        toast.className = `glass-card bg-slate-900/95 border ${borderColor} p-3.5 rounded-xl shadow-xl flex items-center gap-3 text-xs font-semibold text-slate-100 pointer-events-auto transform translate-y-2 opacity-0 transition-all duration-300`;
        toast.innerHTML = `
            <i class="fa-solid ${iconClass} text-base"></i>
            <span class="flex-grow">${message}</span>
        `;

        container.appendChild(toast);

        setTimeout(() => toast.classList.remove('translate-y-2', 'opacity-0'), 10);
        setTimeout(() => {
            toast.classList.add('opacity-0', 'translate-y-2');
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    },

    openModal(modalId, entryId = null) {
        const modal = document.getElementById(modalId);
        const content = document.getElementById(modalId + '-content');
        if (!modal || !content) return;

        if (window.app) {
            if (modalId === 'platforms-modal') app.renderPlatformsList();
            if (modalId === 'data-modal' && app.updateAutoBackupUI) app.updateAutoBackupUI();
            if (modalId === 'franchise-wizard-modal') {
                const queryInput = document.getElementById('franchise-query-input');
                if (queryInput) queryInput.value = '';
                document.getElementById('wizard-search-status')?.classList.add('hidden');
                document.getElementById('wizard-search-results')?.classList.add('hidden');
                document.getElementById('wizard-review-section')?.classList.add('hidden');
                document.getElementById('wizard-save-btn')?.classList.add('hidden');
                app.wizardDiscoveredEntries = [];
            }

            if (modalId === 'entry-modal') {
                const form = document.getElementById('entry-form');
                if (form) form.reset();
                document.getElementById('entry-id').value = '';
                document.getElementById('form-kitsu-id').value = '';
                document.getElementById('form-anilist-id').value = '';
                document.getElementById('form-external-rating').value = '';
                document.getElementById('form-rating-source').value = '';
                document.getElementById('form-rating-updated-at').value = '';
                document.getElementById('duplicate-warning')?.classList.add('hidden');
                app.updatePosterPreview();
                if (window.CatalogueModule) CatalogueModule.clearCatalogSearch();
                app.updateApiSourceUI();

                document.getElementById('modal-title').querySelector('span').textContent = entryId ? 'Edit Media' : 'Add New Media';
                if (entryId) {
                    const entry = app.entries.find(item => item.id === entryId);
                    if (entry) {
                        document.getElementById('entry-id').value = entry.id;
                        document.getElementById('form-kitsu-id').value = entry.externalIds?.kitsu || '';
                        document.getElementById('form-anilist-id').value = entry.externalIds?.anilist || '';
                        document.getElementById('form-title-english').value = entry.titles?.english || entry.titleEnglish || entry.title || '';
                        document.getElementById('form-title-romanji').value = entry.titles?.romanji || entry.titleRomanji || entry.title || '';
                        document.getElementById('form-title-alternatives').value = (entry.titles?.alternatives || []).join(', ');
                        document.getElementById('form-preferred-title').value = entry.preferredTitleMode || 'english';
                        document.getElementById('form-category').value = entry.category || 'anime';
                        document.getElementById('form-status').value = entry.status === 'completed' ? 'completed' : 'active';
                        document.getElementById('form-current-progress').value = entry.currentProgress || 0;
                        document.getElementById('form-total-progress').value = entry.totalProgress || 0;
                        document.getElementById('form-season').value = entry.season || '';
                        document.getElementById('form-cover-url').value = entry.coverUrl || '';
                        document.getElementById('form-external-url').value = entry.externalUrl || '';

                        if (entry.externalRating) {
                            document.getElementById('form-external-rating').value = entry.externalRating;
                            document.getElementById('form-rating-source').value = entry.ratingSource || 'Kitsu';
                            document.getElementById('form-rating-updated-at').value = entry.ratingUpdatedAt || '';
                        }
                        app.updatePosterPreview();
                    }
                } else {
                    document.getElementById('form-category').value = app.activeCategory === 'franchise' ? 'anime' : app.activeCategory;
                }
                app.toggleCategoryFormLabels();
            }
        }

        modal.classList.remove('opacity-0', 'pointer-events-none');
        content.classList.remove('scale-95');
        content.classList.add('scale-100');
    },

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        const content = document.getElementById(modalId + '-content');
        if (!modal) return;
        modal.classList.add('opacity-0', 'pointer-events-none');
        if (content) {
            content.classList.remove('scale-100');
            content.classList.add('scale-95');
        }
    },

    showConfirmDialog(title, message, onConfirm) {
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').textContent = message;

        const cancelBtn = document.getElementById('confirm-cancel-btn');
        const confirmBtn = document.getElementById('confirm-action-btn');

        const cleanup = () => this.closeModal('confirm-modal');
        cancelBtn.onclick = cleanup;
        confirmBtn.onclick = () => {
            onConfirm();
            cleanup();
        };

        this.openModal('confirm-modal');
    },

    getAdaptationBadgeInfo(status) {
        switch(status) {
            case 'complete_adaptation':
                return { text: 'Manga adaptation complete', class: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' };
            case 'manga_ongoing':
                return { text: 'Source manga still ongoing', class: 'bg-cyan-500/15 text-cyber-cyan border-cyan-500/30' };
            case 'incomplete_adaptation':
                return { text: 'Anime adaptation incomplete', class: 'bg-amber-500/15 text-amber-300 border-amber-500/30' };
            case 'anime_original':
                return { text: 'Anime-original story', class: 'bg-brand-500/15 text-brand-300 border-brand-500/30' };
            case 'different_ending':
                return { text: 'Anime has different ending from source', class: 'bg-purple-500/15 text-purple-300 border-purple-500/30' };
            case 'not_applicable':
                return { text: 'No applicable source adaptation', class: 'bg-slate-800 text-slate-400 border-slate-700' };
            case 'unknown':
            default:
                return { text: 'Adaptation status unknown', class: 'bg-slate-900/90 text-slate-400 border-slate-800' };
        }
    }
};

window.UIModule = UIModule;
