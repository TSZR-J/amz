// ==UserScript==
// @name         亚马逊店铺商品筛选工具
// @namespace    amazon-store-filter-multicountry
// @version      3.8
// @description  解析URL中的seller编码，多国家销量查询，可视化表格展示筛选结果
// @downloadURL  https://raw.githubusercontent.com/TSZR-J/amz/main/亚马逊店铺商品筛选工具.user.js
// @updateURL    https://raw.githubusercontent.com/TSZR-J/amz/main/亚马逊店铺商品筛选工具.user.js
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      amazon.zying.net
// @connect      www.amazon.co.uk
// @connect      www.amazon.de
// @connect      www.amazon.fr
// @connect      www.amazon.es
// @connect      www.amazon.it
// @require      https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js
// ==/UserScript==

(function () {
    'use strict';

    // ========== 亚马逊站点配置 ==========
    const amazonSites = [
        { add: "https://www.amazon.it/dp/", name: "意大利(IT)", code: "IT", domain: "amazon.it" },
        { add: "https://www.amazon.fr/dp/", name: "法国(FR)", code: "FR", domain: "amazon.fr" },
        { add: "https://www.amazon.co.uk/dp/", name: "英国(GB)", code: "GB", domain: "amazon.co.uk" },
        { add: "https://www.amazon.de/dp/", name: "德国(DE)", code: "DE", domain: "amazon.de" },
        { add: "https://www.amazon.es/dp/", name: "西班牙(ES)", code: "ES", domain: "amazon.es" }
    ];

    // ========== 默认配置 ==========
    const DEFAULT_CONFIG = {
        judgePages: 10,
        minPriceThreshold: 8,
        maxSellerThreshold: 6,
        batchSize: 20,
        maxConcurrentPages: 3
    };

    // ========== 全局变量 ==========
    let isRunning = false;
    let abortFlag = false;
    let currentConfig = { ...DEFAULT_CONFIG };
    let storeId = '';
    let productTable = null;
    let productData = [];
    let logTextarea = null;
    let imagePreviewModal = null;
    let currentSite = amazonSites.find(s => s.code === 'GB');
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

    // ========== GM 请求（新增426错误处理） ==========
    function gmRequest(options) {
        return new Promise((resolve, reject) => {
            const xhr = typeof GM !== 'undefined' && GM.xmlHttpRequest
            ? GM.xmlHttpRequest
            : typeof GM_xmlhttpRequest !== 'undefined'
            ? GM_xmlhttpRequest
            : null;

            if (!xhr) {
                log('❌ 错误：未找到GM.xmlHttpRequest API');
                reject(new Error('GM.xmlHttpRequest is not available'));
                return;
            }

            xhr({
                method: options.method || 'GET',
                url: options.url,
                headers: options.headers || {},
                data: options.data || null,
                timeout: options.timeout || 10000,
                onload: function (response) {
                    // 捕获426限流错误
                    if (response.status === 426) {
                        log(`❌ 接口限流：${options.url} 返回426错误，终止所有操作`);
                        abortFlag = true; // 终止所有操作
                        reject(new Error(`接口限流：${response.status} ${response.statusText}`));
                        return;
                    }
                    resolve(response);
                },
                onerror: reject,
                ontimeout: () => reject(new Error('timeout'))
            });
        });
    }

    // ========== 工具 ==========
    function parseStoreIdFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        let sellerId = urlParams.get('seller');
        if (!sellerId) {
            const m = window.location.href.match(/seller=([A-Z0-9]+)/i);
            sellerId = m ? m[1] : '';
        }
        if (!sellerId) {
            sellerId = urlParams.get('me');
            const m = window.location.href.match(/me=([A-Z0-9]+)/i);
            sellerId = m ? m[1] : '';
        }
        return sellerId || '';
    }

    function parseCurrentAmazonSite() {
        const host = window.location.hostname;
        const s = amazonSites.find(s => host.includes(s.domain));
        currentSite = s || amazonSites.find(x => x.code === 'GB');
        log(`当前站点：${currentSite.name}`);
        return currentSite;
    }

    function delay(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    function log(msg) {
        if (!logTextarea) return;
        const t = new Date().toLocaleTimeString();
        logTextarea.value += `[${t}] ${msg}\n`;
        logTextarea.scrollTop = logTextarea.scrollHeight;
    }

    function clearLog() {
        if (!logTextarea) logTextarea.value = '';
    }

    // ========== UI ==========
    function createUI() {
        const floatBtn = document.createElement('div');
        floatBtn.id = 'filterFloatBtn';
        floatBtn.style.cssText = `
            position:fixed;top:20px;right:20px;width:50px;height:50px;
            background:linear-gradient(135deg,#2563eb,#3b82f6);border-radius:50%;
            color:white;font-size:20px;display:flex;align-items:center;justify-content:center;
            cursor:pointer;z-index:999999;box-shadow:0 4px 12px rgba(59,130,246,0.4);
        `;
        floatBtn.textContent = '🔍';
        floatBtn.onclick = togglePanels;
        document.body.appendChild(floatBtn);

        const configPanel = document.createElement('div');
        configPanel.id = 'filterConfigPanel';
        configPanel.style.cssText = `
            position:fixed;top:80px;right:20px;width:400px;background:#fff;
            border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.15);
            padding:20px;font-family:system-ui;z-index:999998;display:none;
        `;

        const title = document.createElement('h3');
        title.textContent = '店铺商品筛选配置';
        title.style.margin = '0 0 16px 0';
        title.style.fontSize = '18px';
        title.style.borderBottom = '1px solid #f0f0f0';
        title.style.paddingBottom = '12px';
        configPanel.appendChild(title);

        const info = document.createElement('div');
        info.style.marginBottom = '16px';
        info.style.padding = '10px';
        info.style.background = '#f9fafb';
        info.style.borderRadius = '8px';

        const storeLabel = document.createElement('div');
        storeLabel.style.fontSize = '14px';
        storeLabel.textContent = '当前店铺：';
        const storeVal = document.createElement('span');
        storeVal.id = 'currentStoreId';
        storeVal.style.color = '#2563eb';
        storeVal.textContent = storeId || '未检测';
        storeLabel.appendChild(storeVal);
        info.appendChild(storeLabel);

        const siteLabel = document.createElement('div');
        siteLabel.style.fontSize = '14px';
        siteLabel.style.marginTop = '4px';
        siteLabel.textContent = '当前站点：';
        const siteVal = document.createElement('span');
        siteVal.id = 'currentSite';
        siteVal.style.color = '#d97706';
        siteVal.textContent = `${currentSite.name} (${currentSite.domain})`;
        siteLabel.appendChild(siteVal);
        info.appendChild(siteLabel);
        configPanel.appendChild(info);

        const items = document.createElement('div');
        items.style.display = 'grid';
        items.style.gap = '12px';
        items.style.marginBottom = '16px';
        items.appendChild(createItem('查询页数', 'judgePages', 'number', currentConfig.judgePages));
        items.appendChild(createItem('最低价格', 'minPriceThreshold', 'number', currentConfig.minPriceThreshold));
        items.appendChild(createItem('最大跟卖数', 'maxSellerThreshold', 'number', currentConfig.maxSellerThreshold));
        items.appendChild(createItem('最大并发页数', 'maxConcurrentPages', 'number', currentConfig.maxConcurrentPages));
        configPanel.appendChild(items);

        const btns = document.createElement('div');
        btns.style.display = 'flex';
        btns.style.gap = '10px';

        const startBtn = document.createElement('button');
        startBtn.id = 'startFilterBtn';
        startBtn.textContent = '开始筛选';
        startBtn.style.flex = 1;
        startBtn.style.padding = '12px';
        startBtn.style.background = '#2563eb';
        startBtn.style.color = '#fff';
        startBtn.style.border = 'none';
        startBtn.style.borderRadius = '8px';
        startBtn.onclick = startBatchFilter;
        if (!storeId) startBtn.disabled = true;

        const cancelBtn = document.createElement('button');
        cancelBtn.id = 'cancelFilterBtn';
        cancelBtn.textContent = '取消';
        cancelBtn.style.padding = '12px 20px';
        cancelBtn.style.background = '#f87171';
        cancelBtn.style.color = '#fff';
        cancelBtn.style.border = 'none';
        cancelBtn.style.borderRadius = '8px';
        cancelBtn.style.display = 'none';
        cancelBtn.onclick = cancelFilter;

        btns.appendChild(startBtn);
        btns.appendChild(cancelBtn);
        configPanel.appendChild(btns);

        const logTitle = document.createElement('div');
        logTitle.textContent = '日志';
        logTitle.style.marginTop = '16px';
        logTitle.style.fontSize = '14px';
        configPanel.appendChild(logTitle);

        logTextarea = document.createElement('textarea');
        logTextarea.style.width = '100%';
        logTextarea.style.height = '140px';
        logTextarea.style.marginTop = '8px';
        logTextarea.style.padding = '10px';
        logTextarea.style.borderRadius = '8px';
        logTextarea.style.fontSize = '12px';
        configPanel.appendChild(logTextarea);

        const resetBtn = document.createElement('button');
        resetBtn.textContent = '重置默认配置';
        resetBtn.style.marginTop = '10px';
        resetBtn.style.padding = '6px 12px';
        resetBtn.onclick = resetConfig;
        configPanel.appendChild(resetBtn);

        document.body.appendChild(configPanel);
        createProductTable();
        createImagePreviewModal();
    }

    function createItem(label, id, type, val) {
        const d = document.createElement('div');
        const l = document.createElement('label');
        l.textContent = label;
        l.style.display = 'block';
        l.style.fontSize = '14px';
        l.style.marginBottom = '4px';
        const i = document.createElement('input');
        i.id = id;
        i.type = type;
        i.value = val;
        i.style.width = '100%';
        i.style.padding = '8px';
        i.style.borderRadius = '6px';
        i.style.border = '1px solid #ddd';
        d.appendChild(l);
        d.appendChild(i);
        return d;
    }

    function togglePanels() {
        const cfg = document.getElementById('filterConfigPanel');
        const tab = document.getElementById('productTableContainer');
        const show = cfg.style.display !== 'block';
        cfg.style.display = show ? 'block' : 'none';
        tab.style.display = show ? 'flex' : 'none';
    }

    function resetConfig() {
        document.getElementById('judgePages').value = DEFAULT_CONFIG.judgePages;
        document.getElementById('minPriceThreshold').value = DEFAULT_CONFIG.minPriceThreshold;
        document.getElementById('maxSellerThreshold').value = DEFAULT_CONFIG.maxSellerThreshold;
        document.getElementById('maxConcurrentPages').value = DEFAULT_CONFIG.maxConcurrentPages;
        log('已重置默认配置');
    }

    // ========== 表格（修复表头错位+固定表头） ==========
    function createProductTable() {
        const c = document.createElement('div');
        c.id = 'productTableContainer';
        c.style.cssText = `
            position:fixed;top:20px;left:20px;right:450px;bottom:20px;
            background:#fff;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.12);
            padding:20px;z-index:999997;display:none;flex-direction:column;overflow:hidden;
        `;

        const bar = document.createElement('div');
        bar.style.display = 'flex';
        bar.style.justifyContent = 'space-between';
        bar.style.alignItems = 'center';
        bar.style.marginBottom = '16px';

        const t = document.createElement('h3');
        t.textContent = '合格商品列表';
        t.style.margin = 0;

        const sortBtn = document.createElement('button');
        sortBtn.id = 'sortProductsBtn';
        sortBtn.textContent = '综合排序';
        sortBtn.style.padding = '8px 16px';
        sortBtn.style.background = '#10b981';
        sortBtn.style.color = '#fff';
        sortBtn.style.border = 'none';
        sortBtn.style.borderRadius = '6px';
        sortBtn.onclick = sortProducts;
        sortBtn.disabled = true;

        bar.appendChild(t);
        bar.appendChild(sortBtn);
        c.appendChild(bar);

        // 表格滚动容器
        const tableWrap = document.createElement('div');
        tableWrap.style.flex = 1;
        tableWrap.style.overflow = 'auto';
        tableWrap.style.border = '1px solid #eee';
        tableWrap.style.borderRadius = '8px';

        productTable = document.createElement('table');
        productTable.style.width = '100%';
        productTable.style.borderCollapse = 'collapse';
        productTable.style.fontSize = '13px';
        productTable.style.tableLayout = 'fixed'; // 固定列宽，防止错位

        const thead = document.createElement('thead');
        // 表头固定在顶部
        thead.style.position = 'sticky';
        thead.style.top = '0';
        thead.style.zIndex = '10';
        thead.style.background = '#f6f7f9';

        const tr = document.createElement('tr');
        const heads = ['ASIN', '图片', '标题', '跟卖数', '价格', '大类排名', '小类排名', '英', '德', '法', '意', '西'];
        // 每列固定宽度
        const colWidths = ['80px', '80px', '280px', '70px', '90px', '100px', '100px', '50px', '50px', '50px', '50px', '50px'];
        heads.forEach((h, i) => {
            const th = document.createElement('th');
            th.textContent = h;
            th.style.padding = '10px';
            th.style.background = '#f6f7f9';
            th.style.borderBottom = '1px solid #ddd';
            th.style.whiteSpace = 'nowrap';
            th.style.overflow = 'hidden';
            th.style.textOverflow = 'ellipsis';
            th.style.width = colWidths[i];
            tr.appendChild(th);
        });
        thead.appendChild(tr);
        productTable.appendChild(thead);

        const tbody = document.createElement('tbody');
        tbody.id = 'productTableBody';
        productTable.appendChild(tbody);

        tableWrap.appendChild(productTable);
        c.appendChild(tableWrap);
        document.body.appendChild(c);
    }

    function createImagePreviewModal() {
        const m = document.createElement('div');
        m.id = 'imagePreviewModal';
        m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:9999999;display:none;align-items:center;justify-content:center;';
        const inner = document.createElement('div');
        inner.style.position = 'relative';
        const img = document.createElement('img');
        img.id = 'previewImage';
        img.style.maxHeight = '90vh';
        img.style.maxWidth = '90%';
        const close = document.createElement('button');
        close.textContent = '×';
        close.style.cssText = 'position:absolute;top:-20px;right:-20px;width:40px;height:40px;border-radius:50%;background:#ef4444;color:white;border:none;font-size:20px;cursor:pointer;';
        close.onclick = () => { m.style.display = 'none'; img.src = ''; };
        inner.appendChild(img);
        inner.appendChild(close);
        m.appendChild(inner);
        m.onclick = e => { if (e.target === m) { m.style.display = 'none'; img.src = ''; } };
        document.body.appendChild(m);
        imagePreviewModal = m;
    }

    function showImagePreview(src) {
        if (!src) return;
        const img = document.getElementById('previewImage');
        img.src = src;
        document.getElementById('imagePreviewModal').style.display = 'flex';
    }

    function addProductToTable(p) {
        const tbody = document.getElementById('productTableBody');
        const row = document.createElement('tr');
        row.style.borderBottom = '1px solid #eee';

        const asinTd = document.createElement('td');
        asinTd.innerText = p.asin;
        asinTd.style.padding = '8px';
        asinTd.style.whiteSpace = 'nowrap';
        asinTd.style.overflow = 'hidden';
        asinTd.style.textOverflow = 'ellipsis';
        row.appendChild(asinTd);

        const imgTd = document.createElement('td');
        imgTd.style.padding = '8px';
        imgTd.style.textAlign = 'center';
        const img = document.createElement('img');
        img.src = p.thumb || 'https://via.placeholder.com/60?text=no+img';
        img.style.width = '60px';
        img.style.height = '60px';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '4px';
        img.style.cursor = 'pointer';
        img.onclick = () => showImagePreview(p.thumb);
        img.onerror = () => { img.src = 'https://via.placeholder.com/60?text=err'; };
        imgTd.appendChild(img);
        row.appendChild(imgTd);

        const titleTd = document.createElement('td');
        titleTd.innerText = p.title || '';
        titleTd.style.maxWidth = '280px';
        titleTd.style.whiteSpace = 'nowrap';
        titleTd.style.overflow = 'hidden';
        titleTd.style.textOverflow = 'ellipsis';
        titleTd.style.padding = '8px';
        row.appendChild(titleTd);

        const sellerTd = document.createElement('td');
        sellerTd.innerText = p.sellerCount;
        sellerTd.style.padding = '8px';
        sellerTd.style.textAlign = 'center';
        row.appendChild(sellerTd);

        const priceTd = document.createElement('td');
        priceTd.innerText = `${p.minPrice} ${p.currency}`;
        priceTd.style.padding = '8px';
        priceTd.style.textAlign = 'center';
        priceTd.style.whiteSpace = 'nowrap';
        row.appendChild(priceTd);

        // 大类排名
        const bigRankTd = document.createElement('td');
        bigRankTd.innerText = p.bigRank || '-';
        bigRankTd.style.padding = '8px';
        bigRankTd.style.textAlign = 'center';
        row.appendChild(bigRankTd);

        // 小类排名
        const smallRankTd = document.createElement('td');
        smallRankTd.innerText = p.smallRank || '-';
        smallRankTd.style.padding = '8px';
        smallRankTd.style.textAlign = 'center';
        row.appendChild(smallRankTd);

        // 销量
        const ccList = ['GB', 'DE', 'FR', 'IT', 'ES'];
        ccList.forEach(cc => {
            const td = document.createElement('td');
            const v = p.sales[cc] || 0;
            td.innerText = v > 0 ? v : '-';
            td.style.padding = '8px';
            td.style.textAlign = 'center';
            if (v > 0) {
                td.style.color = '#059669';
                td.style.cursor = 'pointer';
                const site = amazonSites.find(s => s.code === cc);
                if (site) td.onclick = () => window.open(site.add + p.asin, '_blank');
            }
            row.appendChild(td);
        });

        tbody.appendChild(row);
    }

    function clearProductTable() {
        document.getElementById('productTableBody').innerHTML = '';
    }

    // ========== 排序 ==========
    function sortProducts() {
        if (productData.length === 0) return alert('暂无数据');
        const arr = [...productData];
        arr.sort((a, b) => {
            if (a.sellerCount !== b.sellerCount) return a.sellerCount - b.sellerCount;
            const ra = a.smallRank || 9999999;
            const rb = b.smallRank || 9999999;
            if (ra !== rb) return ra - rb;
            const sa = (a.sales.GB || 0) * 100000 + (a.sales.FR || 0) * 10000 + (a.sales.DE || 0) * 1000 + (a.sales.IT || 0) * 100 + (a.sales.ES || 0);
            const sb = (b.sales.GB || 0) * 100000 + (b.sales.FR || 0) * 10000 + (b.sales.DE || 0) * 1000 + (b.sales.IT || 0) * 100 + (b.sales.ES || 0);
            if (sa !== sb) return sb - sa;
            return (b.minPrice || 0) - (a.minPrice || 0);
        });
        clearProductTable();
        arr.forEach(p => addProductToTable(p));
        log('排序完成');
        alert('排序完成');
    }

    // ========== 业务 ==========
    function buildUrl(storeId, page) {
        return `https://www.${currentSite.domain}/s?i=merchant-items&s=exact-aware-popularity-rank&me=${storeId}&page=${page}`;
    }

    async function fetchPageAsins(storeId, page) {
        if (abortFlag) return [];
        const url = buildUrl(storeId, page);
        log(`获取第${page}页`);
        try {
            const r = await gmRequest({ method: 'GET', url });
            const doc = new DOMParser().parseFromString(r.responseText, 'text/html');
            const set = new Set();
            doc.querySelectorAll('[data-asin]').forEach(i => {
                const a = i.dataset.asin?.trim();
                if (a) set.add(a);
            });
            return Array.from(set);
        } catch (e) {
            log(`获取失败：${e.message}`);
            return [];
        }
    }

    function getToken() {
        const t = GM_getValue('token', '').trim();
        if (!t) {
            // 1. 打开登录页新标签
            window.open('https://amazon.zying.net/#/login', '_blank');
            // 2. 友好提示用户
            alert('尚未设置token，请先在新打开的标签页完成登录，然后配置token！');
            // 3. 抛出错误终止后续操作
            throw new Error('未设置token，已打开登录页，请登录后重试');
        }
        return t;
    }

    async function getBatchSalesData(asins, cc, token) {
        if (!asins.length) return {};
        const ts = String(Math.floor(Date.now() / 1000));
        const data = JSON.stringify({ abbr: cc, pagesize: 200, keys: asins });
        const signStr = data + "POST" + "/api/CmdHandler?cmd=zscout_asin.list" + ts + token + "v1";
        const sign = CryptoJS.HmacSHA256(signStr, "https://amazon.zying.net").toString(CryptoJS.enc.Hex);
        try {
            const r = await gmRequest({
                method: 'POST',
                url: 'https://amazon.zying.net/api/CmdHandler?cmd=zscout_asin.list',
                headers: { 'Content-Type': 'application/json', Token: token, Version: 'v1', Signature: sign, Timestamp: ts },
                data, timeout: 15000
            });
            const j = JSON.parse(r.responseText);
            const map = {};
            (j.data?.list || []).forEach(it => {
                map[it.asin] = { sales: it.sales || 0, thumb: it.thumb || '', title: it.title || '' };
            });
            return map;
        } catch (e) {
            log(`获取销量数据失败：${e.message}`);
            return {};
        }
    }

    // ========== 重点：sendBatchAsinDetailRequest 426错误处理 ==========
    async function getBatchAsinDetail(asins, cc, token) {
        if (!asins.length) return {};
        const ts = String(Math.floor(Date.now() / 1000));
        const data = JSON.stringify(asins.map(a => ({ asin: a })));
        const path = `/api/zbig/MoreAboutAsin/v2/${cc}`;
        const signStr = data + "POST" + path + ts + token + "v1";
        const sign = CryptoJS.HmacSHA256(signStr, "https://amazon.zying.net").toString(CryptoJS.enc.Hex);
        try {
            const r = await gmRequest({
                method: 'POST',
                url: 'https://amazon.zying.net' + path,
                headers: { 'Content-Type': 'application/json', Token: token, Version: 'v1', Signature: sign, Timestamp: ts },
                data, timeout: 15000
            });
            return JSON.parse(r.responseText);
        } catch (e) {
            // 捕获426错误并终止
            if (e.message.includes('426')) {
                log(`❌ sendBatchAsinDetailRequest 接口限流（426），终止所有操作`);
                abortFlag = true;
                alert('接口触发限流（426），已终止所有操作，请稍后重试！');
            }
            log(`获取ASIN详情失败：${e.message}`);
            return {};
        }
    }

    // ========== 核心判断 ==========
    function processSingleAsin(asin, detailData, salesMap) {
        const d = detailData.data?.[asin] || detailData[asin] || {};
        const offers = d.Offers || [];
        const sellerId = d.SellerId || '';

        // 自己是否FBA
        const self = offers.find(o => o.SellerId === sellerId);
        const isSelfFBA = !!self && self.IsFba === true;

        // 品牌
        const brandList = d.BrandSourceDetails || [];
        const brandRegistered =
              brandList.filter(i => ['GB', 'DE', 'FR', 'IT', 'ES'].includes(i.Source) && i.Status === '已注册').length >= 2
        || brandList.some(i => i.Source === currentSite.code && i.Status === '已注册');

        // 价格
        const prices = offers.map(o => o.Listing).filter(x => x > 0);
        const minPrice = prices.length ? Math.min(...prices) : 0;
        const currency = offers[0]?.Currency || (currentSite.code === 'GB' ? 'GBP' : 'EUR');

        // 大类、小类排名
        const bsr = d.BSR || [];
        let smallRank = null;
        let bigRank = null;

        if (bsr.length >= 1) {
            smallRank = bsr[0]?.rank ?? null;
        }
        if (bsr.length >= 2) {
            bigRank = bsr[1]?.rank ?? null;
        }

        // 销量信息
        const si = salesMap.GB?.[asin] || {};

        const product = {
            asin,
            title: si.title || '',
            thumb: si.thumb || '',
            sellerCount: offers.length,
            minPrice,
            currency,
            smallRank,
            bigRank,
            sales: {
                GB: salesMap.GB?.[asin]?.sales || 0,
                DE: salesMap.DE?.[asin]?.sales || 0,
                FR: salesMap.FR?.[asin]?.sales || 0,
                IT: salesMap.IT?.[asin]?.sales || 0,
                ES: salesMap.ES?.[asin]?.sales || 0
            },
            brandRegistered,
            isSelfFBA
        };

        const ok = minPrice >= currentConfig.minPriceThreshold
        && offers.length <= currentConfig.maxSellerThreshold
        && (product.sales.GB + product.sales.DE + product.sales.FR + product.sales.IT + product.sales.ES) > 0&&!isSelfFBA&&!brandRegistered;

        return { product, isQualified: ok };
    }

    async function processAsinBatch(batch, token) {
        if (!batch.length || abortFlag) return;
        const ccList = ['GB', 'DE', 'FR', 'IT', 'ES'];
        const salesMaps = {};
        for (const cc of ccList) {
            salesMaps[cc] = await getBatchSalesData(batch, cc, token);
            await delay(300);
        }
        const detail = await getBatchAsinDetail(batch, currentSite.code, token);
        // 如果触发限流，直接返回
        if (abortFlag) return;
        for (const asin of batch) {
            const r = processSingleAsin(asin, detail, salesMaps);
            if (r.isQualified) {
                log(`√合格 ${asin}`);
                addProductToTable(r.product);
                productData.push(r.product);
                document.getElementById('sortProductsBtn').disabled = false;
            } else {
                log(`×不合格 ${asin}：卖家数（${r.product.sellerCount})，是否FBA：（${r.product.isSelfFBA})，是否注册：(${r.product.brandRegistered}）,是否有销量：(${(r.product.sales.GB
                                                                                                                                             + r.product.sales.DE
                                                                                                                                             + r.product.sales.FR
                                                                                                                                             + r.product.sales.IT
                                                                                                                                             + r.product.sales.ES) > 0})`);
            }
        }
    }

    async function fetchPages(storeId, total, maxConcurrent) {
        const all = new Set();
        let page = 1;
        while (page <= total && !abortFlag) {
            const tasks = [];
            for (let i = 0; i < maxConcurrent && page <= total; i++) {
                tasks.push(fetchPageAsins(storeId, page++));
            }
            const chunks = await Promise.all(tasks);
            chunks.forEach(c => c.forEach(a => all.add(a)));
            await delay(800);
        }
        return Array.from(all);
    }

    function cancelFilter() {
        abortFlag = true;
        isRunning = false;
        document.getElementById('cancelFilterBtn').style.display = 'none';
        document.getElementById('startFilterBtn').disabled = false;
        log('已取消');
    }

    async function startBatchFilter() {
        if (isRunning) return;
        if (!storeId) return alert('未获取店铺ID');

        productData = [];
        document.getElementById('sortProductsBtn').disabled = true;

        currentConfig = {
            judgePages: +document.getElementById('judgePages').value || 10,
            minPriceThreshold: +document.getElementById('minPriceThreshold').value || 8,
            maxSellerThreshold: +document.getElementById('maxSellerThreshold').value || 6,
            maxConcurrentPages: +document.getElementById('maxConcurrentPages').value || 3,
            batchSize: 20
        };

        isRunning = true;
        abortFlag = false; // 重置限流标记
        clearLog();
        clearProductTable();
        const startBtn = document.getElementById('startFilterBtn');
        const cancelBtn = document.getElementById('cancelFilterBtn');
        startBtn.disabled = true;
        cancelBtn.style.display = 'inline-block';

        try {
            const token = getToken();
            const asins = await fetchPages(storeId, currentConfig.judgePages, currentConfig.maxConcurrentPages);
            // 如果触发限流，直接终止
            if (abortFlag) throw new Error('接口限流，终止操作');
            log(`共获取ASIN：${asins.length}`);
            for (let i = 0; i < asins.length; i += 20) {
                if (abortFlag) break;
                await processAsinBatch(asins.slice(i, i + 20), token);
                await delay(600);
            }
            log(`完成，合格：${productData.length} 个`);
            alert(`完成！合格 ${productData.length} 个`);
        } catch (e) {
            log(`执行失败：${e.message}`);
            alert(`执行失败：${e.message}`);
        } finally {
            isRunning = false;
            startBtn.disabled = false;
            cancelBtn.style.display = 'none';
        }
    }

    function init() {
        storeId = parseStoreIdFromUrl();
        parseCurrentAmazonSite();
        createUI();
        document.getElementById('currentStoreId').textContent = storeId || '未检测';
        document.getElementById('currentSite').textContent = `${currentSite.name} (${currentSite.domain})`;
        log('初始化完成');
    }

    if (document.readyState === 'complete') init();
    else window.addEventListener('load', init);

})();
