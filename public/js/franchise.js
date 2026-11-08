/**
 * AniTrack - Franchise Module (js/franchise.js)
 * Watch Order features, Franchise Detail rendering, drag-and-drop reordering, and wizard
 */

const FranchiseModule = {
    getWatchOrderDisplayTitle(franchiseEntry, linkedCollectionEntry = null, watchOrderTitleDisplayMode = 'english') {
        if (!franchiseEntry) return 'Untitled';

        const override = franchiseEntry.watchOrderTitleOverride || 'global';
        const mode = override === 'global' ? watchOrderTitleDisplayMode : override;

        const source = linkedCollectionEntry || franchiseEntry;
        const english = source.titles?.english || source.titleEnglish || franchiseEntry.titles?.english || franchiseEntry.titleEnglish || franchiseEntry.title || '';
        const romanji = source.titles?.romanji || source.titleRomanji || franchiseEntry.titles?.romanji || franchiseEntry.titleRomanji || '';
        const legacy = franchiseEntry.title || source.title || '';

        const order = mode === 'romanji'
            ? [romanji, english, legacy]
            : [english, romanji, legacy];

        return order.find(v => String(v || '').trim()) || 'Untitled';
    },

    createFranchiseCardHTML(franc, matchedTitle = null, isHidden = false, entries = []) {
        const totalEntries = franc.entries.length;
        let completedEntries = 0;
        franc.entries.forEach(e => {
            const cid = e.collectionId || e.linkedCollectionId;
            if (cid) {
                const rec = entries.find(item => item.id === cid);
                if (rec && rec.status === 'completed') completedEntries++;
            }
        });
        const pct = totalEntries > 0 ? Math.round((completedEntries / totalEntries) * 100) : 0;
        const adaptInfo = UIModule.getAdaptationBadgeInfo(franc.adaptationStatus);

        return `
            <div class="group glass-card rounded-xl sm:rounded-2xl overflow-hidden flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-xl relative border border-slate-800/85 cursor-pointer h-full" onclick="app.openFranchiseDetail('${franc.id}')">
                <div class="relative aspect-[2/3] overflow-hidden bg-slate-900">
                    <img src="${UIModule.escapeHTML(franc.coverUrl || UIModule.SVG_POSTER_FALLBACK)}" alt="${UIModule.escapeHTML(franc.name)}" loading="lazy" onerror="this.onerror=null;this.src='${UIModule.SVG_POSTER_FALLBACK}';" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105">
                    <div class="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent opacity-90"></div>

                    <div class="absolute top-2 right-2 z-30 flex items-center gap-1.5">
                        ${isHidden ? `<span class="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">🙈 Hidden</span>` : ''}
                        <button onclick="app.toggleCardMenu('franc-${franc.id}', event)" aria-label="Franchise menu" class="card-action-btn w-7 h-7 rounded-full bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/80 flex items-center justify-center shadow-lg active:scale-90 transition-transform">
                            <i class="fa-solid fa-ellipsis-vertical text-xs"></i>
                        </button>
                        <div id="card-menu-franc-${franc.id}" class="card-action-menu hidden absolute right-0 top-full mt-1.5 w-40 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-1 z-40 text-left">
                            <button onclick="app.openEditFranchiseModal('${franc.id}', event)" class="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-slate-200 hover:bg-slate-800 hover:text-cyber-cyan flex items-center gap-2 transition-colors">
                                <i class="fa-solid fa-pen-to-square text-cyber-cyan"></i> Edit Franchise
                            </button>
                            <button onclick="app.openCoverFranchiseModal('${franc.id}', event)" class="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-slate-200 hover:bg-slate-800 hover:text-brand-300 flex items-center gap-2 transition-colors">
                                <i class="fa-solid fa-image text-brand-400"></i> Change Cover
                            </button>
                            ${isHidden ? `
                                <button onclick="app.restoreFranchise('${franc.id}', event)" class="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-emerald-300 hover:bg-emerald-950/40 flex items-center gap-2 transition-colors">
                                    <i class="fa-solid fa-eye text-emerald-400"></i> Restore
                                </button>
                            ` : `
                                <button onclick="app.hideFranchise('${franc.id}', event)" class="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-amber-300 hover:bg-amber-950/40 flex items-center gap-2 transition-colors">
                                    <i class="fa-solid fa-eye-slash text-amber-400"></i> Hide Franchise
                                </button>
                            `}
                            <button onclick="app.deleteFranchise('${franc.id}', event)" class="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-rose-300 hover:bg-rose-950/40 hover:text-rose-200 flex items-center gap-2 transition-colors">
                                <i class="fa-solid fa-trash-can text-rose-400"></i> Delete Franchise
                            </button>
                        </div>
                    </div>

                    <div class="absolute bottom-2 left-2 right-2 z-10 space-y-1">
                        <p class="text-[9px] font-semibold text-cyber-cyan uppercase tracking-wider truncate">${totalEntries} Titles • ${completedEntries}/${totalEntries} Watched</p>
                        <h4 class="text-xs sm:text-sm font-bold text-white leading-snug break-words">${UIModule.escapeHTML(franc.name)}</h4>
                        ${matchedTitle ? `<p class="text-[10px] text-amber-300 bg-slate-950/80 px-2 py-0.5 rounded border border-amber-500/30 truncate"><i class="fa-solid fa-magnifying-glass mr-1"></i> Matched: ${UIModule.escapeHTML(matchedTitle)}</p>` : ''}
                    </div>
                </div>

                <div class="p-3 bg-slate-900/90 space-y-2.5 flex-grow flex flex-col justify-between">
                    <div class="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-semibold border ${adaptInfo.class} w-full truncate" title="${UIModule.escapeHTML(franc.adaptationNotes || adaptInfo.text)}">
                        <i class="fa-solid fa-book-bookmark text-[9px] shrink-0"></i>
                        <span class="truncate">${UIModule.escapeHTML(adaptInfo.text)}</span>
                    </div>

                    <div class="space-y-1.5">
                        <div class="flex items-center justify-between text-[11px]">
                            <span class="text-slate-400 font-medium">Viewing Progress</span>
                            <span class="font-bold text-cyber-cyan">${completedEntries} / ${totalEntries} Finished</span>
                        </div>
                        <div class="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden p-0.5 border border-slate-800">
                            <div class="h-full rounded-full bg-gradient-to-r from-cyber-cyan to-brand-500 transition-all duration-300" style="width: ${pct}%"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    renderFranchiseDetail(franc, entries, watchOrderTitleDisplayMode) {
        const container = document.getElementById('franchise-detail-container');
        if (!franc || !container) return;

        const mainEntries = franc.entries.filter(e => e.classification === 'Main story');
        const extraEntries = franc.entries.filter(e => e.classification === 'Optional extra');
        const adaptInfo = UIModule.getAdaptationBadgeInfo(franc.adaptationStatus);

        const renderEntryRow = (entry, idx) => {
            const cid = entry.collectionId || entry.linkedCollectionId;
            const linkedRec = cid ? entries.find(item => item.id === cid) : null;

            return `
                <div data-franchise-entry-id="${UIModule.escapeHTML(entry.id)}" draggable="true" ondragstart="app.startFranchiseEntryDrag(event, '${franc.id}', '${entry.id}')" ondragend="this.classList.remove('opacity-50')" ondragover="app.allowFranchiseEntryDrop(event)" ondrop="app.dropFranchiseEntry(event, '${franc.id}', '${entry.id}')" class="franchise-entry-row glass-card bg-slate-900/90 rounded-2xl p-3 sm:p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 sm:gap-4 border border-slate-800 w-full min-w-0">
                    <!-- Left Info -->
                    <div class="flex items-start sm:items-center gap-2.5 sm:gap-4 min-w-0 w-full md:w-auto flex-1">
                        <div class="flex flex-col items-center justify-center bg-slate-950 w-7 h-12 sm:w-8 sm:h-14 rounded-xl border border-slate-800 text-xs font-black text-brand-400 shrink-0 mt-0.5 sm:mt-0">
                            #${idx + 1}
                        </div>
                        <img src="${UIModule.escapeHTML(entry.coverUrl || UIModule.SVG_POSTER_FALLBACK)}" onerror="this.src='${UIModule.SVG_POSTER_FALLBACK}';" class="w-12 h-16 sm:w-14 sm:h-20 object-cover rounded-xl bg-slate-950 border border-slate-800 shrink-0">
                        <div class="min-w-0 flex-1 space-y-1">
                            <h4 class="text-xs sm:text-sm font-bold text-white line-clamp-2 leading-tight break-words">${UIModule.escapeHTML(this.getWatchOrderDisplayTitle(entry, linkedRec, watchOrderTitleDisplayMode))}</h4>
                            <div class="flex flex-wrap items-center gap-1.5 text-[10px] sm:text-xs text-slate-400">
                                ${entry.seasonInfo ? `<span class="px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-bold bg-slate-950 border border-slate-800 text-slate-300 uppercase">${UIModule.escapeHTML(entry.seasonInfo)}</span>` : ''}
                                <span>${entry.totalProgress ? `${entry.totalProgress} eps` : 'Ongoing'}</span>
                                ${entry.externalRating ? `<span>•</span><span class="text-amber-400 font-semibold"><i class="fa-solid fa-star text-[9px] mr-0.5"></i> ${entry.externalRating}</span>` : ''}
                            </div>
                            
                            <div class="flex flex-wrap items-center gap-1.5 pt-1">
                                <select onchange="app.updateFranchiseEntryClassification('${franc.id}', '${entry.id}', this.value)" class="bg-slate-950 border border-slate-800 text-[10px] sm:text-[11px] text-slate-200 rounded-lg px-2 py-1 outline-none cursor-pointer max-w-[130px] sm:max-w-none truncate">
                                    <option value="Main story" ${entry.classification === 'Main story' ? 'selected' : ''}>Main Order</option>
                                    <option value="Optional extra" ${entry.classification === 'Optional extra' ? 'selected' : ''}>Extra</option>
                                </select>
                                <select onchange="app.setFranchiseEntryTitleOverride('${franc.id}', '${entry.id}', this.value)" class="bg-slate-950 border border-slate-800 text-[10px] sm:text-[11px] text-slate-300 rounded-lg px-2 py-1 outline-none cursor-pointer" title="Title display">
                                    <option value="global" ${(entry.watchOrderTitleOverride || 'global') === 'global' ? 'selected' : ''}>Global</option>
                                    <option value="english" ${entry.watchOrderTitleOverride === 'english' ? 'selected' : ''}>ENG</option>
                                    <option value="romanji" ${entry.watchOrderTitleOverride === 'romanji' ? 'selected' : ''}>ROM</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- Right Controls: optimized for mobile portrait thumb actions -->
                    <div class="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-2 w-full md:w-auto border-t md:border-t-0 pt-2.5 md:pt-0 border-slate-800/80 shrink-0">
                        <div class="flex-1 md:flex-initial min-w-0">
                            ${linkedRec ? `
                                <div class="bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl text-[11px] sm:text-xs text-emerald-300 flex items-center justify-between gap-2">
                                    <span class="truncate"><i class="fa-solid fa-check-circle mr-1 text-emerald-400"></i>${linkedRec.currentProgress}/${linkedRec.totalProgress || '∞'}</span>
                                    <button onclick="app.incrementProgress('${linkedRec.id}', event)" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded-lg text-[10px] font-bold shadow transition-all">+1</button>
                                </div>
                            ` : `
                                <button onclick="app.linkFranchiseEntryToCollection('${franc.id}', '${entry.id}')" class="bg-slate-950 hover:bg-slate-800 active:scale-95 text-brand-300 border border-brand-500/30 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 w-full">
                                    <i class="fa-solid fa-link text-[10px]"></i> <span class="truncate">Link Collection</span>
                                </button>
                            `}
                        </div>

                        <div class="flex items-center justify-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 shrink-0">
                            <span class="hidden sm:inline-block px-1.5 text-slate-500 cursor-grab select-none" title="Drag to reorder"><i class="fa-solid fa-grip-vertical text-xs"></i></span>
                            <button onclick="app.moveFranchiseEntryOrder('${franc.id}', '${entry.id}', 'up')" class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white active:scale-90 rounded-lg hover:bg-slate-800 transition-transform" title="Move Up"><i class="fa-solid fa-chevron-up text-xs"></i></button>
                            <button onclick="app.moveFranchiseEntryOrder('${franc.id}', '${entry.id}', 'down')" class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white active:scale-90 rounded-lg hover:bg-slate-800 transition-transform" title="Move Down"><i class="fa-solid fa-chevron-down text-xs"></i></button>
                            <button onclick="app.removeEntryFromFranchise('${franc.id}', '${entry.id}')" class="w-8 h-8 flex items-center justify-center text-rose-400 hover:text-rose-300 active:scale-90 rounded-lg hover:bg-rose-950/40 transition-transform" title="Remove from Franchise"><i class="fa-solid fa-xmark text-xs"></i></button>
                        </div>
                    </div>
                </div>
            `;
        };

        container.innerHTML = `
            <div class="flex flex-col sm:flex-row sm:items-center justify-between glass-card p-3.5 sm:p-4 rounded-2xl gap-3">
                <div class="flex items-center gap-3">
                    <button onclick="app.closeFranchiseDetail()" class="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white shrink-0 active:scale-90 transition-transform"><i class="fa-solid fa-arrow-left"></i></button>
                    <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
                            <h3 class="text-sm sm:text-lg font-extrabold text-white leading-tight">${UIModule.escapeHTML(franc.name)}</h3>
                            <span class="px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-semibold border ${adaptInfo.class}">${adaptInfo.text}</span>
                        </div>
                        <p class="text-[11px] sm:text-xs text-slate-400 mt-0.5">${franc.entries.length} entries · ${franc.orderType || 'Release Order'} ${franc.adaptationNotes ? `· ${UIModule.escapeHTML(franc.adaptationNotes)}` : ''}</p>
                    </div>
                </div>
                <div class="flex flex-wrap items-center gap-1.5 sm:gap-2 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-800/80">
                    <label class="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-[11px] text-slate-400">
                        <span class="hidden sm:inline">Titles</span>
                        <select onchange="app.setWatchOrderTitleDisplayMode(this.value)" class="bg-transparent text-slate-200 outline-none cursor-pointer font-semibold text-xs">
                            <option value="english" ${watchOrderTitleDisplayMode === 'english' ? 'selected' : ''}>English</option>
                            <option value="romanji" ${watchOrderTitleDisplayMode === 'romanji' ? 'selected' : ''}>Romaji</option>
                        </select>
                    </label>
                    <button onclick="app.openAddFranchiseEntryModal('${franc.id}')" class="px-3 py-1.5 sm:py-2 bg-gradient-to-r from-cyber-cyan to-brand-500 text-slate-950 rounded-xl text-xs font-bold transition-all shadow active:scale-95"><i class="fa-solid fa-plus mr-1"></i> Add Title</button>
                    <button onclick="app.openEditFranchiseModal('${franc.id}')" class="px-2.5 py-1.5 sm:py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-all active:scale-95">Edit</button>
                    <button onclick="app.openCoverFranchiseModal('${franc.id}')" class="px-2.5 py-1.5 sm:py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-all active:scale-95">Cover</button>
                    <button onclick="app.deleteFranchise('${franc.id}', event)" class="px-2.5 py-1.5 sm:py-2 bg-rose-950/40 hover:bg-rose-900 text-rose-300 border border-rose-900/40 rounded-xl text-xs font-semibold transition-all active:scale-95">Delete</button>
                </div>
            </div>

            <div class="space-y-3">
                <div class="flex items-center justify-between">
                    <h4 class="text-xs sm:text-sm font-bold text-cyber-cyan uppercase tracking-wider flex items-center gap-2">
                        <i class="fa-solid fa-play"></i> Main Watch Order (${mainEntries.length})
                    </h4>
                </div>
                <div class="space-y-2.5">
                    ${mainEntries.length > 0 ? mainEntries.map((e, i) => renderEntryRow(e, i)).join('') : `<p class="text-xs text-slate-500 italic p-3 glass-card rounded-xl">No main watch order titles added yet.</p>`}
                </div>
            </div>

            <div class="space-y-3 pt-2">
                <div class="flex items-center justify-between">
                    <h4 class="text-xs sm:text-sm font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                        <i class="fa-solid fa-gift"></i> Optional Extras (${extraEntries.length})
                    </h4>
                </div>
                <div class="space-y-2.5">
                    ${extraEntries.length > 0 ? extraEntries.map((e, i) => renderEntryRow(e, mainEntries.length + i)).join('') : `<p class="text-xs text-slate-500 italic p-3 glass-card rounded-xl">No optional extras added.</p>`}
                </div>
            </div>
        `;
    }
};

window.FranchiseModule = FranchiseModule;
