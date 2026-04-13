// ==UserScript==
// @name         ASIN销量查询(v4.2)
// @namespace    http://tampermonkey.net/
// @version      4.2
// @downloadURL  https://raw.githubusercontent.com/TSZR-J/amz/main/ASIN销量批量查询.user.js
// @updateURL  https://raw.githubusercontent.com/TSZR-J/amz/main/ASIN销量批量查询.user.js
// @description  单击选中+复制+各国销量+跟卖姓名+价格+规格自动换行+401登录失效提示
// @author       You
// @match        *://*/*
// @grant        GM.xmlHttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      amazon.zying.net
// @require      https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js
// ==/UserScript==

(function () {
    'use strict';

    // 只在顶层窗口运行
    if (window.self !== window.top) return;

    const amazonSites = [
        { name: "英国", code: "GB", colIndex: 2, currency: "£" },
        { name: "法国", code: "FR", colIndex: 3, currency: "€" },
        { name: "德国", code: "DE", colIndex: 4, currency: "€" },
        { name: "意大利", code: "IT", colIndex: 5, currency: "€" },
        { name: "西班牙", code: "ES", colIndex: 6, currency: "€" }
    ];
    const SIZE_COL_INDEX = 1;
    const specPriority = ['GB', 'DE', 'IT', 'ES', 'FR'];
    const API_LIST_URL = 'https://amazon.zying.net/api/CmdHandler?cmd=zscout_asin.list';
    const API_DETAIL_BASE_URL = 'https://amazon.zying.net/api/zbig/MoreAboutAsin/v2/';
    const ZYING_LOGIN_URL = 'https://amazon.zying.net/#/login';
    const BATCH_SIZE = 20;

    let selectedAsins = new Set();
    let asinRowMap = new Map();
    let asinSpecCache = new Map();
    let asinCountryPriceCache = new Map();
    const domain = new URL(window.location.href).hostname;

    let token;
    if (domain === 'amazon.zying.net') {
        token = localStorage.getItem("token")?.replace(/"/g, '');
        GM_setValue("token", token);
    } else {
        token = GM_getValue("token", "");
    }

    function refreshToken() {
        if (domain === 'amazon.zying.net') {
            const newToken = localStorage.getItem("token")?.replace(/"/g, '');
            if (newToken && newToken !== token) {
                token = newToken;
                GM_setValue("token", token);
                showCopyToast("Token已更新");
            }
        }
    }
    setInterval(refreshToken, 3000);

    const sellerIdToPerson = new Map();
    [
        "A2RRES2N4V5JX2;刘常青","A1CUDD63ZN4763;刘景平","APOU9GGLPJWQG;刘浩瀚",
        "A31N3IR8B0X213;吴双娥","A1V0C5VU5N96HN;吴建贵","A2S73B5VZ8N3U3;夏银雪",
        "A3VF36OIAZNR4F;廖春花","A3KWBSYD24ALO0;彭旭","A1IR2E8KFOWN3P;彭水香",
        "A5BKGE50S2UJL;彭苟根","AZA23B0AA7OH7;彭雄","A15TABY6SLL8U7;李海鹏",
        "A1AGUX0XE6RFS8;梅咏秋","AC4F29DKYT0CJ;王华宇","APFZMLZJYIKF7;聂洪荣",
        "A3RSZUJWT6AB2D;舒兵太","A2P6E2J0V7PORA;舒蕾","A1TYHNO3PSR3A;蒋争争",
        "A29XASP7A4XURC;薛园琴","A3QPZVYNJ4UXDQ;郭冬明","A2NQ9DMPFHO4DN;钱春华",
        "A33FD7G7VE21R1;陈林秀","A39X67PN5QRMCW;陈锡岚","A1DJ37ELZU4KW0;韩花楠",
        "A3UQLIM14446WU;黄敏","A3HTYB8UR7TMOM;黄绍梅","AKQJ5QVD5BN2H;黄金根"
    ].forEach(item => {
        const [id, name] = item.split(';');
        id && sellerIdToPerson.set(id.trim().toLowerCase(), name.trim());
    });

    GM_addStyle(`
        #asinQueryBtn {
            position:fixed;bottom:20px;right:20px;padding:12px 30px;background:#0078d7;color:white;
            border:none;border-radius:4px;font-size:16px;cursor:pointer;z-index:9998;
        }
        #asinQueryModalMask {
            position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);
            z-index:9999;display:none;
        }
        #asinQueryModal {
            position:fixed; top:0; left:0; right:0; bottom:0; margin:auto;
            width:95%;max-width:1300px; height:fit-content; max-height:85vh;
            background:#f5f5f5; border-radius:8px; padding:20px; box-shadow:0 4px 20px rgba(0,0,0,0.3);
            z-index:10000; display:none; overflow:hidden;
        }
        #modalCloseBtn {
            position:absolute;top:15px;right:15px;width:30px;height:30px;line-height:30px;
            text-align:center;background:#eee;border-radius:50%;cursor:pointer;font-size:18px;color:#666;
        }
        .tab-bar { display:flex; margin-bottom:15px; gap:10px; }
        .tab { padding:10px 25px; border-radius:4px; cursor:pointer; background:#eee; font-weight:bold; }
        .tab.active { background:#0078d7; color:white; }
        .panel { display:none; }
        .panel.active { display:block; }

        .modal-form-group { margin-bottom:20px; }
        .modal-form-group label { display:block;font-weight:bold;margin-bottom:8px;color:#333;font-size:14px; }
        .modal-form-group textarea, .modal-form-group input, .modal-form-group select {
            width:100%;padding:10px;border:1px solid #ddd;border-radius:4px;font-size:14px;box-sizing:border-box;
        }
        .result-area { display: flex; gap: 12px; }
        .result-left, .result-right { flex:1; }
        .result-text { height:200px; resize:none; color:#000; font-family: monospace; }
        .log-text { height:120px; resize:none; color:#333; font-family: monospace; background:#f9f9f9; }
        .red-text { color:#ff0000; font-weight:bold; }

        .btn-group { display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap; }
        #modalQueryBtn,#modalClearBtn,#modalLoginBtn {
            padding:10px 25px;border:none;border-radius:4px;cursor:pointer;color:#fff;
        }
        #modalQueryBtn { background:#0078d7; }
        #modalClearBtn { background:#f56c6c; }
        #modalLoginBtn { background:#67c23a; }

        .table-container {
            width: 100%; max-height:420px; overflow-y:auto; border:1px solid #ddd; border-radius:4px; background:#fff;
        }
        #resultTable { width:100%; border-collapse:collapse; table-layout:fixed; }
        #resultTable thead { position:sticky; top:0; background:#0078d7; z-index:1; }
        #resultTable th { color:white; padding:12px 8px; font-weight:bold; font-size:14px; cursor:pointer; }
        #resultTable td {
            padding:10px 8px; border:1px solid #ddd; font-size:13px;
            word-break:break-word; white-space:normal; line-height:1.4;
        }
        #resultTable th:nth-child(1),#resultTable td:nth-child(1){width:16%;}
        #resultTable th:nth-child(2),#resultTable td:nth-child(2){width:28%;}
        #resultTable th:nth-child(3),#resultTable td:nth-child(3){width:14%;}
        #resultTable th:nth-child(4),#resultTable td:nth-child(4){width:14%;}
        #resultTable th:nth-child(5),#resultTable td:nth-child(5){width:14%;}
        #resultTable th:nth-child(6),#resultTable td:nth-child(6){width:14%;}
        #resultTable th:nth-child(7),#resultTable td:nth-child(7){width:14%;}

        .asin-cell { cursor:pointer;color:#0078d7;text-decoration:underline; }
        .asin-cell.selected { background:#409eff!important; color:white!important; font-weight:bold; }
        .copy-toast {
            position:fixed; top:0;left:0;right:0;bottom:0; margin:auto; width:260px; height:50px; line-height:50px;
            background:rgba(0,0,0,0.7);color:white;border-radius:6px; font-size:14px;z-index:10002;display:none;text-align:center;
        }
        .sales { color: #0066cc; font-weight:bold; }
        .seller-name { color:#009933; font-weight:bold; }
        .not-followed { color:#ff3333; font-weight:bold; }
        .price { color:#ff6600; font-weight:bold; }
        .sep { color:#999; margin:0 2px; }
        ::-webkit-scrollbar { width:8px; height:8px; }
        ::-webkit-scrollbar-track { background:#f1f1f1; border-radius:4px; }
        ::-webkit-scrollbar-thumb { background:#ccc; border-radius:4px; }
    `);

    let currentTab = 'sales';

    function switchTab(tab) {
        currentTab = tab;
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
        document.getElementById(`panel-${tab}`).classList.add('active');
    }

    function copyTextToClipboard(text) {
        try { return navigator.clipboard.writeText(text); }
        catch (e) {
            const ta = document.createElement('textarea');
            ta.value = text; document.body.appendChild(ta); ta.select();
            document.execCommand('copy'); document.body.removeChild(ta); return true;
        }
    }

    function showCopyToast(text) {
        let t = document.getElementById('copyToast');
        if (!t) { t = document.createElement('div'); t.id = 'copyToast'; t.className = 'copy-toast'; document.body.appendChild(t); }
        t.textContent = text; t.style.display = 'block'; setTimeout(() => t.style.display = 'none', 2500);
    }

    function openZyingLogin() {
        window.open(ZYING_LOGIN_URL, '_blank');
        showCopyToast("请在新标签页登录智赢");
    }

    function handle401Unauthorized() {
        showCopyToast("登录失效，请重新点击登录智赢");
        throw new Error("401");
    }

    // ===================== 日志输出函数 =====================
    function appendLog(msg) {
        const logEl = document.getElementById('queryLog');
        logEl.value = `[${new Date().toLocaleString()}] ${msg}\n` + logEl.value;
    }

    // ===================== 右键复制价格 =====================
    function makeCopyCountryPriceHandler(countryCode) {
        return function(e) {
            e.preventDefault();
            if (selectedAsins.size === 0) {
                showCopyToast('未选中任何ASIN');
                return;
            }
            const prices = [];
            selectedAsins.forEach(asin => {
                const cp = asinCountryPriceCache.get(asin) || {};
                const p = cp[countryCode];
                prices.push(p === 0 || p == null ? '无数据' : p);
            });
            copyTextToClipboard(prices.join('\n'));
            const site = amazonSites.find(s => s.code === countryCode);
            showCopyToast(`已复制 ${selectedAsins.size} 个【${site?.name}】价格`);
        };
    }

    function copySelectedOnRightClick(e) {
        e.preventDefault();
        if (selectedAsins.size === 0) {
            showCopyToast('未选中任何ASIN');
            return;
        }
        copyTextToClipboard(Array.from(selectedAsins).join('\n'));
        showCopyToast(`已复制 ${selectedAsins.size} 个ASIN`);
    }

    // ===================== 本国已注册查询（带日志+红色高亮） =====================
    async function runRegisteredQuery() {
        const t = GM_getValue("token", "");
        const country = document.getElementById('registerCountry').value;
        const input = document.getElementById('modalAsinInput').value.trim().split('\n').map(x => x.trim()).filter(Boolean);
        const asins = [...new Set(input)];
        const output = document.getElementById('registeredResult');
        const logEl = document.getElementById('queryLog');

        output.value = '';
        logEl.value = '';

        if (!t) { showCopyToast("请先登录智赢"); return; }
        if (!country) { showCopyToast("请选择国家"); return; }
        if (asins.length === 0) { showCopyToast("请输入ASIN"); return; }

        const total = asins.length;
        appendLog(`总ASIN数量：${total} 个`);

        const batches = [];
        for (let i = 0; i < asins.length; i += BATCH_SIZE) batches.push(asins.slice(i, i + BATCH_SIZE));

        let processed = 0;
        for (let i = 0; i < batches.length; i++) {
            const batch = batches[i];
            const start = processed + 1;
            const end = processed + batch.length;
            const remain = total - end;

            appendLog(`正在查询：第 ${start} ~ ${end} 个，剩余：${remain} 个`);

            await new Promise(r => setTimeout(r, 200));
            try {
                const ts = Math.round(Date.now() / 1000) + '';
                const data = JSON.stringify(batch.map(a => ({ asin: a })));
                const v = "v1";
                const host = "https://amazon.zying.net";
                const path = `/api/zbig/MoreAboutAsin/v2/${country}`;
                const signStr = data + "POST" + path + ts + t + v;
                const sign = CryptoJS.HmacSHA256(signStr, host).toString(CryptoJS.enc.Hex);

                const res = await new Promise((resolve, reject) => {
                    GM.xmlHttpRequest({
                        method: "POST", url: host + path, data: data,
                        headers: { 'Content-Type': 'application/json', Token: t, Version: v, Signature: sign, Timestamp: ts },
                        onload: r => resolve(r), onerror: reject, timeout: 10000
                    });
                });

                if (res.status === 401) { handle401Unauthorized(); return; }
                const j = JSON.parse(res.responseText);
                if (j.code === 401) { handle401Unauthorized(); return; }
                if (j.code !== 200 || !j.data) {
                    processed += batch.length;
                    continue;
                }

                batch.forEach(asin => {
                    const brand = (j.data[asin] || {}).BrandSourceDetails || [];
                    const isReg = brand.some(b => b?.Source === country && b?.Status === '已注册');
                    if (isReg) {
                        output.value += `<red>${asin}</red>\n`;
                    }
                });

                processed += batch.length;
            } catch (e) {
                processed += batch.length;
            }
        }

        // 替换红色标签
        output.value = output.value.replace(/<red>(.*?)<\/red>/g, (m, p1) => p1).trim();
        const resultHtml = output.value.replace(/^(.*)$/gm, '<span class="red-text">$1</span>');
        output.innerHTML = resultHtml;

        appendLog(`✅ 查询完成！总ASIN：${total} 个`);
        showCopyToast("查询完成");
    }

    // ===================== 原有销量查询逻辑 =====================
    function sendBatchAsinDetailRequest(asins, code, token) {
        if (!token) return Promise.reject(new Error('token为空'));
        return new Promise((resolve, reject) => {
            const ts = Math.round(Date.now() / 1000) + '';
            const data = JSON.stringify(asins.map(a => ({ asin: a })));
            const v = "v1"; const host = "https://amazon.zying.net";
            const path = `/api/zbig/MoreAboutAsin/v2/${code}`;
            const signStr = data + "POST" + path + ts + token + v;
            const sign = CryptoJS.HmacSHA256(signStr, host).toString(CryptoJS.enc.Hex);
            GM.xmlHttpRequest({
                method: "POST", url: host + path, data: data,
                headers: { 'Content-Type': 'application/json', Token: token, Version: v, Signature: sign, Timestamp: ts },
                onload(r) {
                    try {
                        if (r.status === 401) { handle401Unauthorized(); reject(new Error("401")); return; }
                        const d = JSON.parse(r.responseText);
                        if (d.code === 401) { handle401Unauthorized(); reject(new Error("401")); return; }
                        resolve(d);
                    } catch (e) { reject(e); }
                },
                onerror: reject, timeout: 10000
            });
        });
    }

    function batchUpdateSellerMatchAndPrice(asins, code, salesMap, token) {
        return sendBatchAsinDetailRequest(asins, code, token).then(d => {
            if (d.code !== 200 || !d.data) return;
            asins.forEach(asin => {
                const row = asinRowMap.get(asin)?.row; if (!row) return;
                let foundName = null; let minPrice = 0;
                const offers = (d.data[asin] || {}).Offers || [];
                const prices = offers.map(o => o.Listing).filter(x => x > 0);
                if (prices.length) minPrice = Math.min(...prices);
                for (const o of offers) {
                    const sid = (o.SellerId || "").toLowerCase().trim();
                    if (sellerIdToPerson.has(sid)) { foundName = sellerIdToPerson.get(sid); break; }
                }
                const cp = asinCountryPriceCache.get(asin) || {}; cp[code] = minPrice; asinCountryPriceCache.set(asin, cp);
                const site = amazonSites.find(s => s.code === code); if (!site) return;
                const cell = row.cells[site.colIndex]; const sales = salesMap[asin] || "无数据";
                const salesHtml = `<span class="sales">${sales}</span>`;
                const followHtml = foundName ? `<span class="seller-name">${foundName}</span>` : `<span class="not-followed">未跟卖</span>`;
                const priceHtml = minPrice > 0 ? `<span class="price">${site.currency}${minPrice}</span>` : `<span class="price">--</span>`;
                cell.innerHTML = `${salesHtml}<span class="sep">|</span>${followHtml}<span class="sep">|</span>${priceHtml}`;
            });
        }).catch(err => { if (err.message === "401") return Promise.reject(err); });
    }

    function initAsinTable(asins = []) {
        const tb = document.getElementById('tableBody'); tb.innerHTML = '';
        asinRowMap.clear(); asinSpecCache.clear(); asinCountryPriceCache.clear(); selectedAsins.clear();
        if (!asins.length) {
            const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 7; td.textContent = "输入ASIN后点击查询"; tr.appendChild(td); tb.appendChild(tr); return;
        }
        asins.forEach(asin => {
            asinSpecCache.set(asin, {}); asinCountryPriceCache.set(asin, {});
            const tr = document.createElement('tr');
            const asinTd = document.createElement('td'); asinTd.className = "asin-cell"; asinTd.textContent = asin;
            asinTd.onclick = () => {
                if (selectedAsins.has(asin)) { selectedAsins.delete(asin); asinTd.classList.remove('selected'); }
                else { selectedAsins.add(asin); asinTd.classList.add('selected'); }
                copyTextToClipboard(asin); showCopyToast(`已复制：${asin}`);
            };
            asinTd.oncontextmenu = copySelectedOnRightClick;
            tr.appendChild(asinTd);
            const specTd = document.createElement('td'); specTd.textContent = "无数据"; tr.appendChild(specTd);
            amazonSites.forEach(() => { const td = document.createElement('td'); td.textContent = "加载中..."; tr.appendChild(td); });
            tb.appendChild(tr); asinRowMap.set(asin, { row: tr });
        });
    }

    function chunkArray(arr, s) { const c = []; for (let i = 0; i < arr.length; i += s) c.push(arr.slice(i, i + s)); return c; }

    async function sendBatchSalesRequest(site, asins, token) {
        if (!token) { asins.forEach(a => { const r = asinRowMap.get(a)?.row; if (r) r.cells[site.colIndex].innerHTML = '<span class="not-followed">未登录</span>'; }); return; }
        const ts = Math.round(Date.now() / 1000) + '';
        const data = JSON.stringify({ abbr: site.code, pagesize: BATCH_SIZE, keys: asins });
        const signStr = data + "POST" + "/api/CmdHandler?cmd=zscout_asin.list" + ts + token + "v1";
        const sign = CryptoJS.HmacSHA256(signStr, "https://amazon.zying.net").toString(CryptoJS.enc.Hex);
        return new Promise((resolve, reject) => {
            GM.xmlHttpRequest({
                method: "POST", url: API_LIST_URL, data: data,
                headers: { 'Content-Type': 'application/json', Token: token, Version: "v1", Signature: sign, Timestamp: ts },
                onload(r) {
                    try {
                        if (r.status === 401) { handle401Unauthorized(); reject(new Error("401")); return; }
                        const j = JSON.parse(r.responseText);
                        if (j.code === 401) { handle401Unauthorized(); reject(new Error("401")); return; }
                        const salesMap = {}; asins.forEach(a => salesMap[a] = "无数据");
                        if (j.code === 200 && j.data?.list) {
                            j.data.list.forEach(it => {
                                salesMap[it.asin] = it.sales || "无数据";
                                const sm = asinSpecCache.get(it.asin) || {};
                                sm[site.code] = (it.color || '').trim() + '-' + (it.size || '').trim();
                                asinSpecCache.set(it.asin, sm);
                                const row = asinRowMap.get(it.asin)?.row;
                                if (row) row.cells[SIZE_COL_INDEX].textContent = (() => { const m = asinSpecCache.get(it.asin) || {}; for (const c of specPriority) if (m[c]) return m[c]; return '无数据'; })();
                            });
                        }
                        asins.forEach(a => { const row = asinRowMap.get(a)?.row; if (row) row.cells[site.colIndex].textContent = salesMap[a]; });
                        batchUpdateSellerMatchAndPrice(asins, site.code, salesMap, token).then(resolve).catch(reject);
                    } catch (e) { resolve(); }
                },
                onerror: () => resolve(), timeout: 10000
            });
        });
    }

    async function runSalesQuery() {
        const t = GM_getValue("token", "");
        const i = document.getElementById('modalAsinInput').value.trim().split('\n').map(x => x.trim()).filter(Boolean);
        const u = [...new Set(i)];
        initAsinTable(u);
        try {
            const batches = chunkArray(u, BATCH_SIZE);
            const delay = 200;
            for (const site of amazonSites) {
                for (const b of batches) {
                    await new Promise(r => setTimeout(r, delay));
                    await sendBatchSalesRequest(site, b, t);
                }
            }
        } catch (err) { }
    }

    // ===================== 统一查询入口 =====================
    function startQuery() {
        if (currentTab === 'sales') runSalesQuery();
        else if (currentTab === 'register') runRegisteredQuery();
    }

    function clearAll() {
        document.getElementById('modalAsinInput').value = '';
        if (document.getElementById('registeredResult')) document.getElementById('registeredResult').value = '';
        if (document.getElementById('queryLog')) document.getElementById('queryLog').value = '';
        initAsinTable();
    }

    // ===================== 界面渲染 =====================
    function renderDOM() {
        const btn = document.createElement('button');
        btn.id = 'asinQueryBtn'; btn.textContent = 'ASIN查询工具';
        btn.onclick = () => { document.getElementById('asinQueryModalMask').style.display = 'block'; document.getElementById('asinQueryModal').style.display = 'block'; };
        document.body.appendChild(btn);

        const mask = document.createElement('div');
        mask.id = 'asinQueryModalMask';
        mask.onclick = () => { mask.style.display = 'none'; document.getElementById('asinQueryModal').style.display = 'none'; };
        document.body.appendChild(mask);

        const modal = document.createElement('div');
        modal.id = 'asinQueryModal';
        modal.innerHTML = `
            <div id="modalCloseBtn">×</div>
            <h3 style="text-align:center;">ASIN 查询工具 v4.2</h3>

            <div class="tab-bar">
                <div class="tab active" data-tab="sales">各国销量查询</div>
                <div class="tab" data-tab="register">本国已注册查询</div>
            </div>

            <div class="modal-form-group">
                <label>ASIN 输入（一行一个）：</label>
                <textarea id="modalAsinInput" placeholder="B0C84J3HFR\nB0XXXXXXX"></textarea>
            </div>

            <!-- 本国已注册：国家选择 + 日志 + 结果 -->
            <div class="panel" id="panel-register">
                <div class="modal-form-group">
                    <label>选择查询国家：</label>
                    <select id="registerCountry">
                        <option value="GB">英国(GB)</option>
                        <option value="FR">法国(FR)</option>
                        <option value="DE">德国(DE)</option>
                        <option value="IT">意大利(IT)</option>
                        <option value="ES">西班牙(ES)</option>
                    </select>
                </div>

                <div class="modal-form-group">
                    <label>实时日志：</label>
                    <textarea id="queryLog" class="log-text" readonly placeholder="日志将在这里显示..."></textarea>
                </div>

                <div class="modal-form-group">
                    <label>已注册 ASIN 结果（红色高亮）：</label>
                    <div id="registeredResult" class="result-text" style="white-space:pre-line; padding:10px; border:1px solid #ddd; border-radius:4px; background:#fff;"></div>
                </div>
            </div>

            <!-- 各国销量表格 -->
            <div class="panel active" id="panel-sales">
                <div class="table-container">
                    <table id="resultTable">
                        <thead>
                            <tr>
                                <th>ASIN（单击复制/右键多选）</th>
                                <th>规格</th>
                                <th id="header_GB">英国（右键复制价格）</th>
                                <th id="header_FR">法国（右键复制价格）</th>
                                <th id="header_DE">德国（右键复制价格）</th>
                                <th id="header_IT">意大利（右键复制价格）</th>
                                <th id="header_ES">西班牙（右键复制价格）</th>
                            </tr>
                        </thead>
                        <tbody id="tableBody"></tbody>
                    </table>
                </div>
            </div>

            <div class="btn-group">
                <button id="modalQueryBtn">开始查询</button>
                <button id="modalClearBtn">清空</button>
                <button id="modalLoginBtn">智赢登录</button>
            </div>
        `;
        document.body.appendChild(modal);

        document.querySelectorAll('.tab').forEach(tab => {
            tab.onclick = () => switchTab(tab.dataset.tab);
        });

        document.getElementById('modalCloseBtn').onclick = () => { mask.style.display = 'none'; modal.style.display = 'none'; };
        document.getElementById('modalQueryBtn').onclick = startQuery;
        document.getElementById('modalClearBtn').onclick = clearAll;
        document.getElementById('modalLoginBtn').onclick = openZyingLogin;

        amazonSites.forEach(site => {
            const el = document.getElementById(`header_${site.code}`);
            el.addEventListener('contextmenu', makeCopyCountryPriceHandler(site.code));
        });

        initAsinTable();
    }

    window.addEventListener('load', renderDOM);
})();
