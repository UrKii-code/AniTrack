/**
 * AniTrack - Collection Module (js/collection.js)
 * Manages anime & manga library items, progress, card rendering, and filtering
 */

const CollectionModule = {
    getEntryTitle(entry, activeTitleDisplayMode = 'english') {
        if (!entry) return 'Untitled';
        const mode = entry.preferredTitleMode || activeTitleDisplayMode;
        if (mode === 'romanji') {
            return entry.titles?.romanji || entry.titleRomanji || entry.title || 'Untitled';
        }
        return entry.titles?.english || entry.titleEnglish || entry.title || 'Untitled';
    },

    getFilteredEntries(entries, activeCategory, activeStatus, searchQuery, sortBy, titleDisplayMode) {
        return entries.filter(item => {
            if (item.category !== activeCategory) return false;
            if (activeStatus !== 'all' && item.status !== activeStatus) return false;

            if (searchQuery) {
                const normQ = UIModule.normalizeTitle(searchQuery);
                const engMatch = UIModule.normalizeTitle(item.titles?.english || item.titleEnglish).includes(normQ);
                const romMatch = UIModule.normalizeTitle(item.titles?.romanji || item.titleRomanji).includes(normQ);
                const altMatch = (item.titles?.alternatives || []).some(alt => UIModule.normalizeTitle(alt).includes(normQ));
                const seasonMatch = UIModule.normalizeTitle(item.season).includes(normQ);
                if (!engMatch && !romMatch && !altMatch && !seasonMatch) return false;
            }
            return true;
        }).sort((a, b) => {
            const titleA = this.getEntryTitle(a, titleDisplayMode);
            const titleB = this.getEntryTitle(b, titleDisplayMode);

            if (sortBy === 'title') return titleA.localeCompare(titleB);
            if (sortBy === 'externalRating') return (b.externalRating || 0) - (a.externalRating || 0);
            if (sortBy === 'progress') {
                const pctA = a.totalProgress > 0 ? (a.currentProgress / a.totalProgress) : 0;
                const pctB = b.totalProgress > 0 ? (b.currentProgress / b.totalProgress) : 0;
                return pctB - pctA;
            }
            return (b.updatedAt || 0) - (a.updatedAt || 0);
        });
    },

    createCardHTML(item, titleDisplayMode, platforms) {
        const isAnime = item.category === 'anime';
        const unit = isAnime ? 'Ep' : 'Ch';
        
        let progressPct = 0;
        if (item.totalProgress > 0) {
            progressPct = Math.min(100, Math.round((item.currentProgress / item.totalProgress) * 100));
        } else if (item.status === 'completed') {
            progressPct = 100;
        }

        const cover = item.coverUrl || UIModule.SVG_POSTER_FALLBACK;
        const isCompleted = item.status === 'completed';
        const displayTitle = this.getEntryTitle(item, titleDisplayMode);

        const applicablePlatforms = (platforms || []).filter(p => p.enabled && (p.category === item.category || p.category === 'both'));

        return `
            <div id="anime-card-${item.id}" tabindex="0" class="anime-card-item group glass-card rounded-xl sm:rounded-2xl overflow-hidden flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-xl relative border border-slate-800/85 focus:outline-none focus:ring-2 focus:ring-brand-500 h-full">
                
                <div class="anime-poster-wrapper relative aspect-[2/3] overflow-hidden bg-slate-900 cursor-pointer" onclick="app.handlePosterTap('${item.id}', event)">
                    <img src="${UIModule.escapeHTML(cover)}" alt="${UIModule.escapeHTML(displayTitle)}" loading="lazy" onerror="this.onerror=null;this.src='${UIModule.SVG_POSTER_FALLBACK}';" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105">
                    <div class="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent opacity-80 pointer-events-none"></div>
                    
                    <div class="absolute top-2 left-2 flex flex-col items-start gap-1.5 z-30">
                        ${item.externalRating > 0 ? `
                            <div class="bg-slate-950/85 backdrop-blur-md px-1.5 py-0.5 rounded-md text-[10px] font-bold text-amber-400 border border-amber-500/30 flex items-center gap-1 shadow-md" title="Internet Rating (${UIModule.escapeHTML(item.ratingSource || 'Catalog')})">
                                <i class="fa-solid fa-star text-[9px]"></i>
                                <span>${item.externalRating.toFixed(1)}</span>
                            </div>
                        ` : ''}

                        <div class="relative">
                            <button onclick="app.toggleCardMenu('${item.id}', event)" aria-label="Card options" class="card-action-btn w-7 h-7 rounded-full bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/80 flex items-center justify-center shadow-lg active:scale-90 transition-transform">
                                <i class="fa-solid fa-ellipsis-vertical text-xs"></i>
                            </button>
                            <div id="card-menu-${item.id}" class="card-action-menu hidden absolute left-0 top-full mt-1.5 w-36 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-1 z-40 text-left">
                                <button onclick="app.openModal('entry-modal', '${item.id}')" class="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-slate-200 hover:bg-slate-800 hover:text-cyber-cyan flex items-center gap-2 transition-colors">
                                    <i class="fa-solid fa-pen-to-square text-brand-400"></i> Edit
                                </button>
                                <button onclick="app.deleteEntry('${item.id}', event)" class="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-rose-300 hover:bg-rose-950/40 hover:text-rose-200 flex items-center gap-2 transition-colors">
                                    <i class="fa-solid fa-trash-can text-rose-400"></i> Delete
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="absolute top-2 right-2 z-30 shadow-lg pointer-events-none">
                        ${isCompleted 
                            ? `<span class="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider rounded-md bg-emerald-500 text-slate-950 border border-emerald-300 shadow">Completed</span>`
                            : `<span class="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider rounded-md bg-cyber-cyan text-slate-950 border border-cyan-300 shadow">${isAnime ? 'Watching' : 'Reading'}</span>`
                        }
                    </div>

                    <div class="anime-title-overlay">
                        <div class="space-y-1">
                            ${item.season ? `<p class="text-[10px] font-semibold text-brand-300 uppercase tracking-wider">${UIModule.escapeHTML(item.season)}</p>` : ''}
                            <span class="overlay-text">${UIModule.escapeHTML(displayTitle)}</span>
                        </div>
                    </div>
                </div>

                <div class="p-2.5 sm:p-3 bg-slate-900/90 flex flex-col justify-between flex-grow space-y-2">
                    <!-- Title Bar for Instant Reading on Mobile & Desktop -->
                    <div class="space-y-0.5 min-w-0" title="${UIModule.escapeHTML(displayTitle)}">
                        <h4 class="text-xs sm:text-sm font-bold text-white line-clamp-2 leading-tight break-words">${UIModule.escapeHTML(displayTitle)}</h4>
                        ${item.season ? `<p class="text-[10px] text-brand-400 font-medium truncate">${UIModule.escapeHTML(item.season)}</p>` : ''}
                    </div>

                    <div class="flex items-center justify-between text-[11px] sm:text-xs pt-0.5">
                        <span class="text-slate-400 font-medium">${isAnime ? 'Episodes' : 'Chapters'}</span>
                        <span class="font-bold text-slate-200">
                            ${item.currentProgress} <span class="text-slate-500">/ ${item.totalProgress > 0 ? item.totalProgress : '∞'}</span>
                        </span>
                    </div>

                    <div class="w-full bg-slate-950 rounded-full h-1.5 sm:h-2 overflow-hidden p-0.5 border border-slate-800">
                        <div class="h-full rounded-full ${isCompleted ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : 'bg-gradient-to-r from-brand-500 to-cyber-cyan'} transition-all duration-300" style="width: ${item.totalProgress > 0 ? progressPct : (item.currentProgress > 0 ? '100' : '0')}%"></div>
                    </div>

                    <div class="grid grid-cols-2 gap-1.5 pt-1">
                        <div class="relative">
                            <button onclick="app.openMediaPlatformLink('${item.id}')" class="w-full h-9 sm:h-9 rounded-xl bg-brand-600/90 hover:bg-brand-500 active:scale-95 text-white flex items-center justify-center gap-1.5 text-xs font-semibold shadow transition-all">
                                <i class="fa-solid ${isAnime ? 'fa-play' : 'fa-book-open'} text-[10px]"></i>
                                <span>${isAnime ? 'Watch' : 'Read'}</span>
                            </button>
                            ${applicablePlatforms.length > 0 ? `
                                <button onclick="app.togglePlatformMenu('${item.id}', event)" aria-label="Select custom streaming platform" class="platform-dropdown-btn absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center justify-center text-[10px] shadow active:scale-90">
                                    <i class="fa-solid fa-chevron-down"></i>
                                </button>
                                <div id="platform-menu-${item.id}" class="platform-dropdown-menu hidden absolute left-0 bottom-full mb-1.5 w-44 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-1 z-30 text-left">
                                    <div class="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-800/80">
                                        Select Platform
                                    </div>
                                    ${applicablePlatforms.map(pf => `
                                        <button onclick="app.openMediaPlatformLink('${item.id}', '${UIModule.escapeHTML(pf.url)}')" class="w-full text-left px-2.5 py-2 rounded-lg text-xs font-medium text-slate-200 hover:bg-slate-800 hover:text-cyber-cyan flex items-center gap-2 transition-colors">
                                            <i class="fa-solid ${UIModule.escapeHTML(pf.icon || 'fa-globe')} text-slate-400 text-xs"></i>
                                            <span class="truncate">${UIModule.escapeHTML(pf.name)}</span>
                                        </button>
                                    `).join('')}
                                </div>
                            ` : ''}
                        </div>

                        <button onclick="app.incrementProgress('${item.id}', event)" class="w-full h-9 sm:h-9 rounded-xl bg-emerald-600/90 hover:bg-emerald-500 active:scale-95 text-white flex items-center justify-center gap-1.5 text-xs font-semibold shadow transition-all" title="Quick +1 ${unit}">
                            <i class="fa-solid fa-plus text-[10px]"></i>
                            <span>+1 ${unit}</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
};

window.CollectionModule = CollectionModule;
