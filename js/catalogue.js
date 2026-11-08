/**
 * AniTrack - Catalogue Module (js/catalogue.js)
 * Handles Kitsu and AniList API searches, responses, and duplicate detection
 */

const CatalogueModule = {
    catalogAbortController: null,
    searchRequestId: 0,

    clearCatalogSearch() {
        if (this.catalogAbortController) {
            this.catalogAbortController.abort();
            this.catalogAbortController = null;
        }
        const input = document.getElementById('catalog-search-input');
        const results = document.getElementById('catalog-search-results');
        const status = document.getElementById('catalog-search-status');
        const dupWarn = document.getElementById('duplicate-warning');
        if (input) input.value = '';
        if (results) { results.innerHTML = ''; results.classList.add('hidden'); }
        if (status) { status.textContent = ''; status.classList.add('hidden'); }
        if (dupWarn) dupWarn.classList.add('hidden');
        const button = document.getElementById('catalog-search-button');
        if (button) { button.disabled = false; button.innerHTML = '<i class="fa-solid fa-magnifying-glass mr-1"></i> Search'; }
    },

    async searchCatalog(preferredSource) {
        if (!navigator.onLine) {
            UIModule.showToast('Catalogue search requires an active internet connection.', 'error');
            return;
        }

        const query = document.getElementById('catalog-search-input').value.trim();
        const category = document.getElementById('form-category').value;
        const resultsEl = document.getElementById('catalog-search-results');
        const statusEl = document.getElementById('catalog-search-status');
        const button = document.getElementById('catalog-search-button');

        if (query.length < 2) {
            statusEl.textContent = 'Enter at least 2 characters to search.';
            statusEl.classList.remove('hidden');
            resultsEl.classList.add('hidden');
            return;
        }

        if (this.catalogAbortController) this.catalogAbortController.abort();
        this.catalogAbortController = new AbortController();
        const currentRequestId = ++this.searchRequestId;

        const sourceLabel = preferredSource === 'anilist' ? 'AniList' : 'Kitsu';
        button.disabled = true;
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Searching';
        statusEl.textContent = `Searching ${sourceLabel} catalogue…`;
        statusEl.classList.remove('hidden');
        resultsEl.innerHTML = '';
        resultsEl.classList.add('hidden');

        const timeoutId = setTimeout(() => {
            if (this.catalogAbortController) this.catalogAbortController.abort('timeout');
        }, 10000);

        let unifiedResults = [];

        try {
            if (preferredSource === 'kitsu') {
                const endpoint = category === 'manga' ? 'manga' : 'anime';
                const url = `https://kitsu.io/api/edge/${endpoint}?filter[text]=${encodeURIComponent(query)}&page[limit]=6`;
                
                const response = await fetch(url, { 
                    headers: { 'Accept': 'application/vnd.api+json' },
                    signal: this.catalogAbortController.signal
                });
                
                if (response.ok) {
                    const payload = await response.json();
                    const items = Array.isArray(payload.data) ? payload.data : [];
                    items.forEach(item => {
                        const attr = item.attributes || {};
                        const kitsuId = String(item.id);
                        const titleEnglish = attr.titles?.en || attr.canonicalTitle || 'Untitled';
                        const titleRomanji = attr.titles?.en_jp || attr.canonicalTitle || titleEnglish;
                        const titleJapanese = attr.titles?.ja_jp || '';
                        const imageUrl = attr.posterImage?.medium || attr.posterImage?.original || '';
                        const year = attr.startDate ? attr.startDate.slice(0, 4) : '';
                        const total = category === 'manga' ? attr.chapterCount : attr.episodeCount;
                        const subtype = attr.subtype ? attr.subtype.toUpperCase() : (category === 'manga' ? 'MANGA' : 'ANIME');

                        let externalRating = null;
                        if (attr.averageRating) {
                            externalRating = parseFloat((parseFloat(attr.averageRating) / 10).toFixed(1));
                        }

                        let seasonInfo = subtype;
                        if (year) seasonInfo += ` (${year})`;

                        unifiedResults.push({
                            id: 'kitsu-' + kitsuId,
                            kitsuId,
                            anilistId: null,
                            titleEnglish,
                            titleRomanji,
                            titleJapanese,
                            imageUrl,
                            total: total || 0,
                            seasonInfo,
                            externalRating,
                            category,
                            source: 'Kitsu'
                        });
                    });
                } else {
                    throw new Error('Kitsu API error');
                }
            } else {
                const gqlQuery = `
                    query ($search: String, $type: MediaType) {
                        Page (perPage: 6) {
                            media (search: $search, type: $type) {
                                id
                                title {
                                    english
                                    romaji
                                    native
                                }
                                coverImage {
                                    large
                                    medium
                                }
                                episodes
                                chapters
                                seasonYear
                                format
                                averageScore
                            }
                        }
                    }
                `;

                const variables = {
                    search: query,
                    type: category === 'manga' ? 'MANGA' : 'ANIME'
                };

                const response = await fetch('https://graphql.anilist.co', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                    },
                    body: JSON.stringify({
                        query: gqlQuery,
                        variables: variables
                    }),
                    signal: this.catalogAbortController.signal
                });

                if (response.ok) {
                    const payload = await response.json();
                    const mediaList = payload.data?.Page?.media || [];
                    
                    mediaList.forEach(item => {
                        const anilistId = String(item.id);
                        const titleEnglish = item.title?.english || item.title?.romaji || 'Untitled';
                        const titleRomanji = item.title?.romaji || item.title?.english || titleEnglish;
                        const titleJapanese = item.title?.native || '';
                        const imageUrl = item.coverImage?.large || item.coverImage?.medium || '';
                        const total = category === 'manga' ? (item.chapters || 0) : (item.episodes || 0);
                        const year = item.seasonYear ? String(item.seasonYear) : '';
                        const format = item.format ? item.format.replace(/_/g, ' ') : (category === 'manga' ? 'MANGA' : 'ANIME');

                        let externalRating = null;
                        if (item.averageScore) {
                            externalRating = parseFloat((item.averageScore / 10).toFixed(1));
                        }

                        let seasonInfo = format;
                        if (year) seasonInfo += ` (${year})`;

                        unifiedResults.push({
                            id: 'anilist-' + anilistId,
                            kitsuId: null,
                            anilistId,
                            titleEnglish,
                            titleRomanji,
                            titleJapanese,
                            imageUrl,
                            total: total || 0,
                            seasonInfo,
                            externalRating,
                            category,
                            source: 'AniList'
                        });
                    });
                } else {
                    throw new Error('AniList API error');
                }
            }
        } catch (err) {
            if (err.name === 'AbortError') return;
            console.warn('Catalogue API search failed', err);
            statusEl.textContent = `Error connecting to ${sourceLabel}. Please check network or switch source.`;
            button.disabled = false;
            button.innerHTML = '<i class="fa-solid fa-magnifying-glass mr-1"></i> Search';
            return;
        }

        clearTimeout(timeoutId);
        if (currentRequestId !== this.searchRequestId) return;

        if (!unifiedResults.length) {
            statusEl.textContent = `No matches found on ${sourceLabel}.`;
            button.disabled = false;
            button.innerHTML = '<i class="fa-solid fa-magnifying-glass mr-1"></i> Search';
            return;
        }

        statusEl.textContent = `Found ${unifiedResults.length} result(s) via ${sourceLabel}:`;
        statusEl.classList.remove('hidden');
        resultsEl.classList.remove('hidden');

        unifiedResults.forEach(item => {
            const resultButton = document.createElement('button');
            resultButton.type = 'button';
            resultButton.className = 'w-full flex items-center gap-3 p-2 rounded-xl border border-slate-800 bg-slate-950/70 hover:bg-slate-800 hover:border-brand-500/60 text-left transition-colors';
            
            const poster = document.createElement('img');
            poster.className = 'w-12 h-16 object-cover rounded-lg bg-slate-800 shrink-0';
            poster.src = item.imageUrl || UIModule.SVG_POSTER_FALLBACK;
            poster.onerror = () => { poster.src = UIModule.SVG_POSTER_FALLBACK; };

            const info = document.createElement('span');
            info.className = 'min-w-0 flex-1';
            
            const titleLine = document.createElement('span');
            titleLine.className = 'block text-sm font-semibold text-slate-100 truncate';
            titleLine.textContent = item.titleEnglish;

            const romLine = document.createElement('span');
            romLine.className = 'block text-xs text-brand-300 truncate';
            romLine.textContent = item.titleRomanji !== item.titleEnglish ? item.titleRomanji : '';

            const metaLine = document.createElement('span');
            metaLine.className = 'block mt-0.5 text-[11px] text-slate-400';
            const countLabel = category === 'manga' ? 'ch' : 'ep';
            metaLine.textContent = `[${item.source}] ${item.seasonInfo} · ${item.total ? `${item.total} ${countLabel}` : 'Ongoing'} ${item.externalRating ? `· ★ ${item.externalRating}` : ''}`;

            info.append(titleLine, romLine, metaLine);
            resultButton.append(poster, info);

            resultButton.addEventListener('click', () => {
                if (window.app) app.selectCatalogResult(item);
            });
            resultsEl.appendChild(resultButton);
        });

        button.disabled = false;
        button.innerHTML = '<i class="fa-solid fa-magnifying-glass mr-1"></i> Search';
    },

    findExistingMatch(entries, { kitsuId, anilistId, titles, category = 'anime' }) {
        const normalizedKitsuId = kitsuId ? String(kitsuId) : '';
        const normalizedAniListId = anilistId ? String(anilistId) : '';
        if (normalizedKitsuId) {
            const foundKitsu = entries.find(e => String(e.externalIds?.kitsu || '') === normalizedKitsuId);
            if (foundKitsu) return { entry: foundKitsu, matchType: 'exact-kitsu-id' };
        }
        if (normalizedAniListId) {
            const foundAni = entries.find(e => String(e.externalIds?.anilist || '') === normalizedAniListId);
            if (foundAni) return { entry: foundAni, matchType: 'exact-anilist-id' };
        }

        const incomingEnglish = UIModule.normalizeTitle(titles?.english || titles?.[0]);
        const incomingRomaji = UIModule.normalizeTitle(titles?.romanji || titles?.[1]);
        const wantedCategory = category || 'anime';
        
        for (const entry of entries) {
            if ((entry.category || 'anime') !== wantedCategory) continue;
            const existingEnglish = UIModule.normalizeTitle(entry.titles?.english || entry.titleEnglish || entry.title);
            const existingRomaji = UIModule.normalizeTitle(entry.titles?.romanji || entry.titleRomanji);
            
            // Only exact equality on normalized title, NEVER substring matching (e.g. Dragon Ball Z must not match Dragon Ball Z Movie 05)
            if ((incomingEnglish && existingEnglish && existingEnglish === incomingEnglish) ||
                (incomingRomaji && existingRomaji && existingRomaji === incomingRomaji)) {
                return { entry, matchType: 'exact-title' };
            }
        }
        return null;
    }
};

window.CatalogueModule = CatalogueModule;
