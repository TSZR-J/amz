// ==UserScript==
// @name         ASIN销量查询(v3.5)（弹窗版）
// @namespace    http://tampermonkey.net/
// @version      3.5
// @downloadURL  https://raw.githubusercontent.com/TSZR-J/amz/main/ASIN销量批量查询.user.js
// @updateURL    https://raw.githubusercontent.com/TSZR-J/amz/main/ASIN销量批量查询.user.js
// @description  单击选中+复制/右键复制（清晰+居中+登录+表格滚动修复）
// @author       You
// @match        *://*/*
// @grant        GM.xmlHttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      amazon.zying.net
// @require      https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js
// ==/UserScript==

(function() {
    'use strict';

    const amazonSites = [
        { name: "英国", code: "GB", colIndex: 2 },
        { name: "法国", code: "FR", colIndex: 3 },
        { name: "德国", code: "DE", colIndex: 4 },
        { name: "意大利", code: "IT", colIndex: 5 },
        { name: "西班牙", code: "ES", colIndex: 6 }
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
        "A3KWBSYD24ALO;彭旭","A1AGUX0XE6RFS8;王华宇","AZA23B0AA7OH7;彭雄",
        "A15TABY6SLL8U7;李海鹏","A2S73B5VZ8N3U3;夏银雪","A1IR2E8KFOWN3P;彭水香",
        "A3QPZVYNJ4UXDQ;郭冬明","A1DJ37ELZU4KW0;韩花楠","A1TYHNO3PSR3A;蒋争争",
        "APFZMLZJYIKF7;聂洪荣","A1AGUX0XE6RFS8;梅咏秋","A2P6E2J0V7PORA;舒蕾",
        "A2RRES2N4V5JX2;刘常青","APOU9GGLPJWQG;刘浩瀚","A1CUDD63ZN4763;刘景平",
        "A33FD7G7VE21R1;陈林秀","A3HTYB8UR7TMOM;黄绍梅","A3VF36OIAZNR4F;廖春花",
        "A5BKGE50S2UJL;彭苟根","A3UQLIM14446WU;黄敏","AKQJ5QVD5BN2H;黄金根",
        "A2NQ9DMPFHO4DN;钱春华","A39X67PN5QRMCW;陈锡岚","A29XASP7A4XURC;薛园琴",
        "A3RSZUJWT6AB2D;舒兵太","A31N3IR8B0X213;吴双娥","A1V0C5VU5N96HN;吴建贵"
    ].forEach(item => {
        const [id, name] = item.split(';');
        id && sellerIdToPerson.set(id.trim().toLowerCase(), name.trim());
    });

    GM_addStyle(`
        #asinQueryBtn {
            position:fixed;bottom:20px;right:20px;padding:12px 30px;background:#0078d7;color:white;
            border:none;border-radius:4px;font-size:16px;cursor:pointer;z-index:9998;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }
        #asinQueryModalMask {
            position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);
            z-index:9999;display:none;
        }
        #asinQueryModal {
            position:fixed; top:0; left:0; right:0; bottom:0; margin:auto;
            width:95%;max-width:1000px; height:fit-content; max-height:85vh;
            background:#f5f5f5; border-radius:8px; padding:20px; box-shadow:0 4px 20px rgba(0,0,0,0.3);
            z-index:10000; display:none; overflow:hidden;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }
        #modalCloseBtn {
            position:absolute;top:15px;right:15px;width:30px;height:30px;line-height:30px;
            text-align:center;background:#eee;border-radius:50%;cursor:pointer;font-size:18px;color:#666;
        }
        .modal-form-group { margin-bottom:20px; }
        .modal-form-group label { display:block;font-weight:bold;margin-bottom:8px;color:#333;font-size:14px; }
        .modal-form-group textarea {
            width:100%;padding:10px;border:1px solid #ddd;border-radius:4px;font-size:14px;
            box-sizing:border-box;height:120px;resize:vertical;
        }
        .btn-group { display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap; }
        #modalQueryBtn,#modalClearBtn,#modalLoginBtn {
            padding:10px 25px;border:none;border-radius:4px;cursor:pointer;color:#fff;
        }
        #modalQueryBtn { background:#0078d7; }
        #modalClearBtn { background:#f56c6c; }
        #modalLoginBtn { background:#67c23a; }

        /* ========== 表格滚动彻底修复 ========== */
        .table-container {
            width: 100%;
            max-height: 420px;
            overflow-y: auto;
            border: 1px solid #ddd;
            border-radius: 4px;
            background: #fff;
        }
        #resultTable {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
        }
        #resultTable thead {
            position: sticky;
            top: 0;
            background: #0078d7;
            z-index: 1;
        }
        #resultTable th {
            color:white; padding:12px 8px; font-weight:bold; font-size:14px;
        }
        #resultTable td {
            padding:10px 8px; border:1px solid #ddd; font-size:13px;
            word-break: break-all;
        }
        .asin-cell { cursor:pointer;color:#0078d7;text-decoration:underline; }
        .asin-cell.selected { background:#409eff!important; color:white!important; font-weight:bold; }

        .copy-toast {
            position:fixed; top:0; left:0; right:0; bottom:0; margin:auto;
            width:200px; height:50px; line-height:50px;
            background:rgba(0,0,0,0.7);color:white;border-radius:6px;
            font-size:14px;z-index:10002;display:none;text-align:center;
        }
        .seller-match-tip { margin-left:6px; font-size:12px; font-weight:bold!important; }
        .seller-green { color:#0078d7!important; }
        .seller-red { color:#ff4d4f!important; }
        .seller-gray { color:#999!important; }

        ::-webkit-scrollbar { width:8px; height:8px; }
        ::-webkit-scrollbar-track { background:#f1f1f1; border-radius:4px; }
        ::-webkit-scrollbar-thumb { background:#ccc; border-radius:4px; }
        ::-webkit-scrollbar-thumb:hover { background:#999; }
    `);

    function copyTextToClipboard(text) {
        try {
            return navigator.clipboard.writeText(text);
        } catch (e) {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            return true;
        }
    }

    function showCopyToast(text) {
        let t = document.getElementById('copyToast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'copyToast';
            t.className = 'copy-toast';
            document.body.appendChild(t);
        }
        t.textContent = text;
        t.style.display = 'block';
        setTimeout(() => t.style.display = 'none', 1500);
    }

    function openZyingLogin() {
        window.open(ZYING_LOGIN_URL, '_blank');
        showCopyToast("请在新标签页登录智赢");
    }

    function toggleSelectAndCopy(asin, tdEl) {
        if (selectedAsins.has(asin)) {
            selectedAsins.delete(asin);
            tdEl.classList.remove('selected');
        } else {
            selectedAsins.add(asin);
            tdEl.classList.add('selected');
        }
        copyTextToClipboard(asin);
        showCopyToast(`已复制：${asin}`);
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

    function getCombinedSpec(color, size) {
        const c = (color || '').trim(), s = (size || '').trim();
        return c && s ? `${c}-${s}` : c || s || '';
    }

    function getPrioritySpec(asin) {
        const m = asinSpecCache.get(asin) || {};
        for (const c of specPriority) if (m[c]) return m[c];
        return '无数据';
    }

    function sendBatchAsinDetailRequest(asins, code, token) {
        if (!token) return Promise.reject(new Error('token为空'));
        return new Promise((resolve, reject) => {
            const ts = Math.round(Date.now()/1000)+'';
            const data = JSON.stringify(asins.map(a => ({ asin:a })));
            const v = "v1";
            const host = "https://amazon.zying.net";
            const path = `/api/zbig/MoreAboutAsin/v2/${code}`;
            const signStr = data + "POST" + path + ts + token + v;
            const sign = CryptoJS.HmacSHA256(signStr, host).toString(CryptoJS.enc.Hex);
            GM.xmlHttpRequest({
                method: "POST",
                url: host + path,
                data: data,
                headers: {
                    'Content-Type':'application/json', Token:token, Version:v,
                    Signature:sign, Timestamp:ts
                },
                onload(r) {
                    try { resolve(JSON.parse(r.responseText)) } catch(e) { reject(e) }
                },
                onerror: reject,
                timeout: 10000
            });
        });
    }

    function batchUpdateSellerMatch(asins, code, salesMap, token) {
        sendBatchAsinDetailRequest(asins, code, token).then(d => {
            if (d.code !== 200 || !d.data) return;
            asins.forEach(asin => {
                const r = asinRowMap.get(asin)?.row;
                if (!r) return;
                let found = null;
                const offers = (d.data[asin] || {}).Offers || [];
                for (const o of offers) {
                    const sid = (o.SellerId || "").toLowerCase().trim();
                    if (sellerIdToPerson.has(sid)) {
                        found = sellerIdToPerson.get(sid);
                        break;
                    }
                }
                const site = amazonSites.find(s => s.code === code);
                if (!site) return;
                const cell = r.cells[site.colIndex];
                const sales = salesMap[asin] || "无数据";
                const cls = found ? "seller-green" : "seller-red";
                const tip = found ? `（${found}）` : "（未跟卖）";
                cell.innerHTML = `${sales}<span class="seller-match-tip ${cls}">${tip}</span>`;
            });
        }).catch(()=>{});
    }

    function initAsinTable(asins = []) {
        const tb = document.getElementById('tableBody');
        tb.innerHTML = '';
        asinRowMap.clear();
        asinSpecCache.clear();
        selectedAsins.clear();

        if (!asins.length) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 7;
            td.textContent = "输入ASIN后点击查询（自动去重）";
            tr.appendChild(td);
            tb.appendChild(tr);
            return;
        }

        asins.forEach(asin => {
            asinSpecCache.set(asin, {});
            const tr = document.createElement('tr');

            const asinTd = document.createElement('td');
            asinTd.className = "asin-cell";
            asinTd.textContent = asin;
            asinTd.onclick = () => toggleSelectAndCopy(asin, asinTd);
            asinTd.oncontextmenu = copySelectedOnRightClick;
            tr.appendChild(asinTd);

            const specTd = document.createElement('td');
            specTd.textContent = "无数据";
            tr.appendChild(specTd);

            amazonSites.forEach(() => {
                const td = document.createElement('td');
                td.textContent = "加载中...";
                tr.appendChild(td);
            });

            tb.appendChild(tr);
            asinRowMap.set(asin, { row: tr });
        });
    }

    function chunkArray(arr, s) {
        const c = [];
        for (let i=0; i<arr.length; i+=s) c.push(arr.slice(i, i+s));
        return c;
    }

    async function sendBatchSalesRequest(site, asins, token) {
        if (!token) {
            asins.forEach(a => {
                const r = asinRowMap.get(a)?.row;
                if (r) r.cells[site.colIndex].innerHTML = "未登录<span class='seller-gray'>（未登录）</span>";
            });
            return;
        }
        const ts = Math.round(Date.now()/1000)+'';
        const data = JSON.stringify({ abbr:site.code, pagesize:BATCH_SIZE, keys:asins });
        const signStr = data + "POST" + "/api/CmdHandler?cmd=zscout_asin.list" + ts + token + "v1";
        const sign = CryptoJS.HmacSHA256(signStr, "https://amazon.zying.net").toString(CryptoJS.enc.Hex);

        return new Promise(resolve => {
            GM.xmlHttpRequest({
                method: "POST",
                url: API_LIST_URL,
                data: data,
                headers: {
                    'Content-Type':'application/json', Token:token, Version:"v1",
                    Signature:sign, Timestamp:ts
                },
                onload(r) {
                    try {
                        const j = JSON.parse(r.responseText);
                        const salesMap = {};
                        asins.forEach(a => salesMap[a] = "无数据");
                        if (j.code === 200 && j.data?.list) {
                            j.data.list.forEach(it => {
                                salesMap[it.asin] = it.sales || "无数据";
                                const sm = asinSpecCache.get(it.asin) || {};
                                sm[site.code] = getCombinedSpec(it.color, it.size);
                                asinSpecCache.set(it.asin, sm);
                                const row = asinRowMap.get(it.asin)?.row;
                                if (row) row.cells[SIZE_COL_INDEX].textContent = getPrioritySpec(it.asin);
                            });
                        }
                        asins.forEach(a => {
                            const row = asinRowMap.get(a)?.row;
                            if (row) row.cells[site.colIndex].textContent = salesMap[a];
                        });
                        batchUpdateSellerMatch(asins, site.code, salesMap, token);
                    } catch(e){}
                    resolve();
                },
                onerror: () => resolve(),
                timeout: 10000
            });
        });
    }

    async function processRequests(allAsins, token) {
        const batches = chunkArray(allAsins, BATCH_SIZE);
        const delay = 200;
        for (const site of amazonSites) {
            for (const b of batches) {
                await new Promise(r => setTimeout(r, delay));
                await sendBatchSalesRequest(site, b, token);
            }
        }
    }

    function initQuery() {
        const t = GM_getValue("token", "");
        const i = document.getElementById('modalAsinInput').value.trim().split('\n').map(x => x.trim()).filter(Boolean);
        const u = [...new Set(i)];
        initAsinTable(u);
        processRequests(u, t);
    }

    function renderDOM() {
        const btn = document.createElement('button');
        btn.id = 'asinQueryBtn';
        btn.textContent = 'ASIN销量查询(v3.5)';
        btn.onclick = () => {
            document.getElementById('asinQueryModalMask').style.display = 'block';
            document.getElementById('asinQueryModal').style.display = 'block';
        };
        document.body.appendChild(btn);

        const mask = document.createElement('div');
        mask.id = 'asinQueryModalMask';
        mask.onclick = () => {
            mask.style.display = 'none';
            document.getElementById('asinQueryModal').style.display = 'none';
        };
        document.body.appendChild(mask);

        const modal = document.createElement('div');
        modal.id = 'asinQueryModal';
        modal.innerHTML = `
            <div id="modalCloseBtn">×</div>
            <h3 style="text-align:center;">ASIN销量查询(v3.5)</h3>
            <div class="modal-form-group">
                <label>ASIN输入（一行一个）：</label>
                <textarea id="modalAsinInput" placeholder="B0C84J3HFR\nB08XXXXXXX"></textarea>
            </div>
            <div class="btn-group">
                <button id="modalQueryBtn">开始查询</button>
                <button id="modalClearBtn">清空</button>
                <button id="modalLoginBtn">智赢登录</button>
            </div>
            <div class="table-container">
                <table id="resultTable">
                    <thead>
                        <tr>
                            <th>ASIN（单击复制/右键多选）</th>
                            <th>规格</th>
                            <th>英国</th>
                            <th>法国</th>
                            <th>德国</th>
                            <th>意大利</th>
                            <th>西班牙</th>
                        </tr>
                    </thead>
                    <tbody id="tableBody"></tbody>
                </table>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('modalCloseBtn').onclick = () => {
            mask.style.display = 'none';
            modal.style.display = 'none';
        };
        document.getElementById('modalQueryBtn').onclick = initQuery;
        document.getElementById('modalClearBtn').onclick = () => {
            document.getElementById('modalAsinInput').value = '';
            initAsinTable();
        };
        document.getElementById('modalLoginBtn').onclick = openZyingLogin;

        initAsinTable();
    }

    window.addEventListener('load', renderDOM);
})();
