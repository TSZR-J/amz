// ==UserScript==
// @name         亚马逊店铺商品筛选工具
// @namespace    amazon-store-filter-multicountry
// @version      5.4
// @description  解析URL中的seller编码，多国家销量查询，可视化表格展示筛选结果，支持本地缓存
// @downloadURL  https://raw.githubusercontent.com/TSZR-J/amz/main/亚马逊店铺商品筛选工具.user.js
// @updateURL    https://raw.githubusercontent.com/TSZR-J/amz/main/亚马逊店铺商品筛选工具.user.js
// @match        *://www.amazon.co.uk/*
// @match        *://www.amazon.de/*
// @match        *://www.amazon.fr/*
// @match        *://www.amazon.es/*
// @match        *://www.amazon.it/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      amazon.zying.net
// @connect      seller.zying.net
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
        { add: "https://www.amazon.it/dp/", name: "意大利(IT)", code: "IT", domain: "amazon.it", defaultMinPrice: 11, currency: "EUR" },
        { add: "https://www.amazon.fr/dp/", name: "法国(FR)", code: "FR", domain: "amazon.fr", defaultMinPrice: 11, currency: "EUR" },
        { add: "https://www.amazon.co.uk/dp/", name: "英国(GB)", code: "GB", domain: "amazon.co.uk", defaultMinPrice: 8, currency: "GBP" },
        { add: "https://www.amazon.de/dp/", name: "德国(DE)", code: "DE", domain: "amazon.de", defaultMinPrice: 11, currency: "EUR" },
        { add: "https://www.amazon.es/dp/", name: "西班牙(ES)", code: "ES", domain: "amazon.es", defaultMinPrice: 10, currency: "EUR" }
    ];

    // ========== 默认配置 ==========
    const DEFAULT_CONFIG = {
        judgePages: 10,          // 跟卖只扫前5页足够
        maxSellerThreshold: 6,   // 最大跟卖人数
        maxConcurrentPages: 5,
        includeSelfFBA: true     // 新增：默认包含FBA商品
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
    let loginBtn = null;
    let zyAccountInput = null;
    let zyPasswordInput = null;
    // 新增：自定义最低价格输入框引用
    let customMinPriceInput = null;
    // 新增：存储亚马逊页面解析的ASIN-图片/标题映射
    let asinAmazonInfoMap = {};
    // 新增：FBA筛选配置复选框引用
    let includeSelfFBACheckbox = null;
    // 新增：标记已选按钮引用
    let markSelectedBtn = null;

    let sortConfig = {
        column: null,
        direction: 'asc'
    };

    // ========== 缓存 ==========
    function getStoreCache(storeId) {
        if (!storeId) return [];
        try {
            const cacheData = GM_getValue(`amz_filter_${storeId}`, '[]');
            return JSON.parse(cacheData);
        } catch (e) {
            log(`读取缓存失败：${e.message}`);
            return [];
        }
    }

    function saveStoreCache(storeId, data) {
        if (!storeId || !Array.isArray(data)) return;
        try {
            GM_setValue(`amz_filter_${storeId}`, JSON.stringify(data));
            log(`已保存${data.length}条数据到本地缓存`);
        } catch (e) {
            log(`保存缓存失败：${e.message}`);
        }
    }

    // 新增：店铺已选状态相关方法
    function getStoreSelectedStatus(storeId) {
        if (!storeId) return false;
        try {
            const selectedStores = JSON.parse(GM_getValue('amz_selected_stores', '[]'));
            return selectedStores.includes(storeId);
        } catch (e) {
            log(`读取已选状态失败：${e.message}`);
            return false;
        }
    }

    function setStoreSelectedStatus(storeId, isSelected) {
        if (!storeId) return;
        try {
            let selectedStores = JSON.parse(GM_getValue('amz_selected_stores', '[]'));
            if (isSelected) {
                if (!selectedStores.includes(storeId)) {
                    selectedStores.push(storeId);
                }
            } else {
                selectedStores = selectedStores.filter(id => id !== storeId);
            }
            GM_setValue('amz_selected_stores', JSON.stringify(selectedStores));
            updateMarkSelectedButton(); // 更新按钮状态
        } catch (e) {
            log(`保存已选状态失败：${e.message}`);
        }
    }

    function clearStoreCache(storeId) {
        if (!storeId) return;
        GM_setValue(`amz_filter_${storeId}`, '[]');
        productData = [];
        clearProductTable();
        log(`已清空店铺${storeId}的缓存数据`);
        showCopyToast("已清空缓存，标记为筛选完成");
    }

    function loadCacheToTable() {
        if (!storeId) return;
        const cacheData = getStoreCache(storeId);
        if (cacheData.length > 0) {
            productData = cacheData;
            clearProductTable();
            cacheData.forEach(p => addProductToTable(p));
            log(`从缓存加载了${cacheData.length}条合格产品数据`);
        }
    }

    // ========== GM 请求 ==========
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
                    if (response.status === 429) {
                        log(`❌ 接口限流：${options.url} 返回429错误，终止所有操作，请重新点击登录`);
                        abortFlag = true;
                        GM_setValue("zytoken", "");
                        updateLoginButtonStatus();
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
        log(`默认最低售价门槛：${currentSite.defaultMinPrice} ${currentSite.currency}`);
        return currentSite;
    }
    /**
 * 从亚马逊图片的srcset属性中解析3x分辨率的图片地址
 * @param {string} srcset - 图片的srcset属性值（如："url1 1x, url2 2x, url3 3x"）
 * @param {string} fallbackSrc - 备用图片地址（当解析不到3x时使用）
 * @returns {string} 3x分辨率的图片地址，解析失败则返回备用地址
 */
    function parseAmazonImage3xUrl(srcset, fallbackSrc = '') {
        // 空值处理
        if (!srcset || typeof srcset !== 'string') {
            return fallbackSrc;
        }

        // 分割srcset为多个图片项（处理中英文逗号、多余空格）
        const imageItems = srcset.split(/,+/).map(item => item.trim()).filter(item => item);

        // 定义分辨率优先级（从高到低），同时记录匹配规则
        const resolutionPriorities = [
            { name: '3x', pattern: /^(.*?)\s+3x$/i },
            { name: '2.5x', pattern: /^(.*?)\s+2\.5x$/i },
            { name: '2x', pattern: /^(.*?)\s+2x$/i },
            { name: '1.5x', pattern: /^(.*?)\s+1\.5x$/i },
            { name: '1x', pattern: /^(.*?)\s+1x$/i },
            { name: '0.5x', pattern: /^(.*?)\s+0\.5x$/i }
        ];

        // 核心逻辑：先按分辨率优先级遍历，再检查所有图片项
        for (const priority of resolutionPriorities) {
            for (const item of imageItems) {
                const match = item.match(priority.pattern);
                if (match && match[1]) {
                    return match[1].trim(); // 找到最高优先级的分辨率，直接返回
                }
            }
        }

        // 未找到任何匹配的分辨率，返回备用地址
        return fallbackSrc;
    }
    // 修改原有parseAmazonPageInfo函数中的图片解析部分
    function parseAmazonPageInfo(html, asins) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        asins.forEach(asin => {
            // 查找对应ASIN的元素
            const itemEl = doc.querySelector(`[data-asin="${asin}"]`);
            if (!itemEl) return;

            // 解析图片（优先3x高清图）
            const imgEl = itemEl.querySelector('img.s-image, img.a-dynamic-image');
            if (imgEl) {
                // 提取3x图片地址
                const srcset = imgEl.getAttribute('srcset') || '';
                const src = imgEl.getAttribute('src') || '';
                const imgUrl = parseAmazonImage3xUrl(srcset, src);

                // 解析标题：优先取h2下span的文本
                const titleEl = itemEl.querySelector('h2 span');
                const title = titleEl?.textContent?.trim() || '';

                if (imgUrl || title) {
                    asinAmazonInfoMap[asin] = {
                        thumb: imgUrl, // 现在存储的是3x高清图
                        title: title
                    };
                }
            }
        });
    }

    // 新增：更新标记已选按钮状态
    function updateMarkSelectedButton() {
        if (!markSelectedBtn || !storeId) return;
        const isSelected = getStoreSelectedStatus(storeId);
        if (isSelected) {
            markSelectedBtn.textContent = '✅ 已选';
            markSelectedBtn.style.background = '#10b981';
            // 更新店铺ID显示，添加已选标识
            document.getElementById('currentStoreId').innerHTML = `${storeId} <span style="color:#10b981;font-size:12px;">[已选]</span>`;
        } else {
            markSelectedBtn.textContent = '标记已选';
            markSelectedBtn.style.background = '#3b82f6';
            document.getElementById('currentStoreId').textContent = storeId;
        }
    }

    // 新增：处理标记已选点击事件
    function handleMarkSelectedClick() {
        if (!storeId) {
            showCopyToast('未检测到店铺ID！');
            return;
        }
        const currentStatus = getStoreSelectedStatus(storeId);
        setStoreSelectedStatus(storeId, !currentStatus);
        const newStatus = !currentStatus;
        log(`${newStatus ? '标记' : '取消'}店铺${storeId}为已选`);
        showCopyToast(newStatus ? '已标记为已选' : '已取消已选标记');
    }

    // 新增：获取最终使用的最低价格（自定义优先，无则用默认）
    function getFinalMinPrice() {
        // 获取自定义输入框的值
        const customValue = customMinPriceInput?.value?.trim();
        // 如果输入了有效数字，使用自定义值；否则用站点默认值
        if (customValue && !isNaN(customValue) && parseFloat(customValue) > 0) {
            return parseFloat(customValue);
        }
        return currentSite.defaultMinPrice;
    }

    // 新增：磅转克工具函数（1磅 = 453.59237克）
    function poundToGram(pound) {
        if (!pound || isNaN(pound) || pound <= 0) return '0';
        const gram = pound * 453.59237;
        return gram.toFixed(0);
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

    function showCopyToast(msg) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position:fixed;top:20px;left:50%;transform:translateX(-50%);
            background:rgba(0,0,0,0.8);color:white;padding:8px 16px;
            border-radius:4px;z-index:9999999;font-size:14px;
        `;
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.remove();
        }, 2000);
    }

    // ========== 登录 ==========
    function getZyToken() {
        return GM_getValue("zytoken", "").trim();
    }
    function saveZyToken(token) { GM_setValue("zytoken", token); }
    function saveZyAccountPassword(account, password) {
        GM_setValue("zy_account", account);
        GM_setValue("zy_password", password);
    }
    function getZyAccount() { return GM_getValue("zy_account", ""); }
    function getZyPassword() { return GM_getValue("zy_password", ""); }
    function isZyLoggedIn() { return !!getZyToken(); }

    function updateLoginButtonStatus() {
        if (!loginBtn) return;
        if (isZyLoggedIn()) {
            loginBtn.textContent = '✅ 已登录';
            loginBtn.style.background = '#10b981';
            loginBtn.disabled = true;
            loginBtn.style.cursor = 'not-allowed';
            loginBtn.onclick = null;
        } else {
            loginBtn.textContent = '🔑 登录智赢';
            loginBtn.style.background = '#f59e0b';
            loginBtn.disabled = false;
            loginBtn.style.cursor = 'pointer';
            loginBtn.onclick = handleLoginClick;
        }
    }

    function handleZyLoginExpired() {
        GM_setValue("zytoken", "");
        abortFlag = true;
        log('❌ 智赢登录失效，请重新登录！');
        showCopyToast("智赢登录失效，请重新登录！");
        updateLoginButtonStatus();
    }

    async function handleLoginClick() {
        const account = zyAccountInput.value.trim();
        const password = zyPasswordInput.value.trim();
        if (!account || !password) {
            showCopyToast("请输入账号和密码！");
            zyAccountInput.focus();
            return;
        }
        loginBtn.disabled = true;
        loginBtn.textContent = '🔄 登录中...';
        loginBtn.style.background = '#64748b';
        try {
            await zyLogin(account, password);
        } catch (e) {
            updateLoginButtonStatus();
        }
    }

    async function zyLogin(account, password) {
        const token = getZyToken() || '';
        const ts = String(Math.floor(Date.now() / 1000));
        const data = JSON.stringify({ name: account, pwd: password, remember: true });
        const path = "/api/authv2/Login";
        const signStr = data + "POST" + path + ts + token + "v1";
        const sign = CryptoJS.HmacSHA256(signStr, "https://seller.zying.net").toString(CryptoJS.enc.Hex);

        try {
            const r = await gmRequest({
                method: 'POST',
                url: 'https://seller.zying.net' + path,
                headers: {
                    'Content-Type': 'application/json',
                    'Token': token,
                    'Version': 'v1',
                    'Signature': sign,
                    'Timestamp': ts
                },
                data,
                timeout: 15000
            });
            const result = JSON.parse(r.responseText);
            if (result.success === true && result.token) {
                saveZyToken(result.token);
                saveZyAccountPassword(account, password);
                log('✅ 智赢登录成功');
                showCopyToast("智赢登录成功！");
                updateLoginButtonStatus();
                return result;
            } else {
                const errorMsg = result.message || result.msg || '登录失败';
                log(`❌ 登录失败：${errorMsg}`);
                showCopyToast(`登录失败：${errorMsg}`);
                throw new Error(errorMsg);
            }
        } catch (e) {
            log(`❌ 登录请求失败：${e.message}`);
            showCopyToast(`登录请求失败：${e.message}`);
            throw e;
        }
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

        // 新增：标记已选按钮
        markSelectedBtn = document.createElement('button');
        markSelectedBtn.id = 'markSelectedBtn';
        markSelectedBtn.style.marginTop = '8px';
        markSelectedBtn.style.padding = '6px 12px';
        markSelectedBtn.style.border = 'none';
        markSelectedBtn.style.borderRadius = '6px';
        markSelectedBtn.style.background = '#3b82f6';
        markSelectedBtn.style.color = 'white';
        markSelectedBtn.style.fontSize = '12px';
        markSelectedBtn.style.cursor = 'pointer';
        markSelectedBtn.onclick = handleMarkSelectedClick;
        info.appendChild(markSelectedBtn);

        const siteLabel = document.createElement('div');
        siteLabel.style.fontSize = '14px';
        siteLabel.style.marginTop = '4px';
        siteLabel.textContent = '当前站点：';
        const siteVal = document.createElement('span');
        siteVal.id = 'currentSite';
        siteVal.style.color = '#d97706';
        siteVal.textContent = `${currentSite.name} (默认≥${currentSite.defaultMinPrice}${currentSite.currency})`;
        siteLabel.appendChild(siteVal);
        info.appendChild(siteLabel);
        configPanel.appendChild(info);

        // 登录区域 - 调整为两列布局
        const zyAccountContainer = document.createElement('div');
        zyAccountContainer.style.marginBottom = '16px';
        zyAccountContainer.style.padding = '10px';
        zyAccountContainer.style.background = '#f0f9ff';
        zyAccountContainer.style.borderRadius = '8px';

        // 账号密码两列布局容器
        const accountPwdRow = document.createElement('div');
        accountPwdRow.style.display = 'flex';
        accountPwdRow.style.gap = '10px';
        accountPwdRow.style.marginBottom = '8px';

        // 账号列
        const accountCol = document.createElement('div');
        accountCol.style.flex = 1;
        const zyAccountLabel = document.createElement('label');
        zyAccountLabel.textContent = '智赢账号：';
        zyAccountLabel.style.display = 'block';
        zyAccountLabel.style.fontSize = '14px';
        zyAccountLabel.style.marginBottom = '4px';
        zyAccountLabel.style.color = '#0369a1';
        zyAccountInput = document.createElement('input');
        zyAccountInput.id = 'zyingAccountInput';
        zyAccountInput.type = 'text';
        zyAccountInput.value = getZyAccount();
        zyAccountInput.style.width = '100%';
        zyAccountInput.style.padding = '8px';
        zyAccountInput.style.borderRadius = '6px';
        zyAccountInput.style.border = '1px solid #ddd';
        zyAccountInput.style.fontSize = '13px';
        zyAccountInput.placeholder = '请输入智赢账号';
        accountCol.appendChild(zyAccountLabel);
        accountCol.appendChild(zyAccountInput);

        // 密码列
        const passwordCol = document.createElement('div');
        passwordCol.style.flex = 1;
        const zyPasswordLabel = document.createElement('label');
        zyPasswordLabel.textContent = '智赢密码：';
        zyPasswordLabel.style.display = 'block';
        zyPasswordLabel.style.fontSize = '14px';
        zyPasswordLabel.style.marginBottom = '4px';
        zyPasswordLabel.style.color = '#0369a1';
        zyPasswordInput = document.createElement('input');
        zyPasswordInput.id = 'zyingPasswordInput';
        zyPasswordInput.type = 'password';
        zyPasswordInput.value = getZyPassword();
        zyPasswordInput.style.width = '100%';
        zyPasswordInput.style.padding = '8px';
        zyPasswordInput.style.borderRadius = '6px';
        zyPasswordInput.style.border = '1px solid #ddd';
        zyPasswordInput.style.fontSize = '13px';
        zyPasswordInput.placeholder = '请输入智赢密码';
        passwordCol.appendChild(zyPasswordLabel);
        passwordCol.appendChild(zyPasswordInput);

        accountPwdRow.appendChild(accountCol);
        accountPwdRow.appendChild(passwordCol);

        loginBtn = document.createElement('button');
        loginBtn.id = 'loginZhiyingBtn';
        loginBtn.style.width = '100%';
        loginBtn.style.padding = '8px';
        loginBtn.style.border = 'none';
        loginBtn.style.borderRadius = '6px';
        loginBtn.style.fontSize = '14px';
        loginBtn.style.fontWeight = '500';

        zyAccountContainer.appendChild(accountPwdRow);
        zyAccountContainer.appendChild(loginBtn);
        configPanel.appendChild(zyAccountContainer);

        // 配置项区域 - 调整为3列，让最低价格和最大并发页数同行
        const items = document.createElement('div');
        items.style.display = 'grid';
        items.style.gridTemplateColumns = '1fr 1fr 1fr'; // 三列布局
        items.style.gap = '12px';
        items.style.marginBottom = '16px';

        // 配置项分组
        items.appendChild(createItem('查询页数', 'judgePages', 'number', currentConfig.judgePages));
        items.appendChild(createItem('最大跟卖数', 'maxSellerThreshold', 'number', currentConfig.maxSellerThreshold));
        items.appendChild(createItem('最大并发页数', 'maxConcurrentPages', 'number', currentConfig.maxConcurrentPages));

        // 自定义最低价格 - 占前两列，和最大并发页数同行
        const customMinPriceItem = createItem(
            `自定义最低价格 (${currentSite.currency})`,
            'customMinPrice',
            'number',
            currentSite.defaultMinPrice
        );
        customMinPriceItem.style.gridColumn = '1 / 3'; // 占前两列，和最大并发页数同行
        const hint = document.createElement('div');
        hint.style.fontSize = '12px';
        hint.style.color = '#6b7280';
        hint.style.marginTop = '4px';
        hint.textContent = `留空则使用默认值：${currentSite.defaultMinPrice} ${currentSite.currency}`;
        customMinPriceItem.appendChild(hint);
        items.appendChild(customMinPriceItem);

        // 新增：FBA筛选配置项
        const includeSelfFBAItem = document.createElement('div');
        includeSelfFBAItem.style.gridColumn = '3 / 4'; // 占第三列
        const includeSelfFBALabel = document.createElement('label');
        includeSelfFBALabel.textContent = '包含FBA';
        includeSelfFBALabel.style.display = 'block';
        includeSelfFBALabel.style.fontSize = '14px';
        includeSelfFBALabel.style.marginBottom = '4px';
        includeSelfFBACheckbox = document.createElement('input');
        includeSelfFBACheckbox.id = 'includeSelfFBA';
        includeSelfFBACheckbox.type = 'checkbox';
        includeSelfFBACheckbox.checked = currentConfig.includeSelfFBA;
        includeSelfFBACheckbox.style.width = 'auto';
        includeSelfFBACheckbox.style.marginRight = '8px';
        // 绑定复选框变更事件
        includeSelfFBACheckbox.addEventListener('change', function() {
            currentConfig.includeSelfFBA = this.checked;
            log(`已${this.checked ? '启用' : '禁用'}包含FBA商品筛选`);
        });
        const checkboxWrapper = document.createElement('div');
        checkboxWrapper.style.display = 'flex';
        checkboxWrapper.style.alignItems = 'center';
        checkboxWrapper.appendChild(includeSelfFBACheckbox);
        checkboxWrapper.appendChild(includeSelfFBALabel);
        includeSelfFBAItem.appendChild(checkboxWrapper);
        items.appendChild(includeSelfFBAItem);

        configPanel.appendChild(items);

        const btns = document.createElement('div');
        btns.style.display = 'flex';
        btns.style.gap = '10px';
        btns.style.marginBottom = '12px'; // 进一步缩小间距，让日志框更靠上

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

        // 日志区域 - 再增高、再上移
        const logContainer = document.createElement('div');
        logContainer.style.marginTop = '0';
        logContainer.style.flex = 1;

        const logTitle = document.createElement('div');
        logTitle.textContent = '日志';
        logTitle.style.fontSize = '14px';
        logTitle.style.marginBottom = '6px';
        logContainer.appendChild(logTitle);

        logTextarea = document.createElement('textarea');
        logTextarea.style.width = '100%';
        logTextarea.style.height = '260px'; // 从220px再增高到260px
        logTextarea.style.padding = '10px';
        logTextarea.style.borderRadius = '8px';
        logTextarea.style.fontSize = '12px';
        logTextarea.style.fontFamily = 'monospace';
        logTextarea.style.border = '1px solid #ddd';
        logTextarea.style.resize = 'vertical'; // 允许垂直调整大小
        logContainer.appendChild(logTextarea);
        configPanel.appendChild(logContainer);

        const resetBtn = document.createElement('button');
        resetBtn.textContent = '重置默认配置';
        resetBtn.style.marginTop = '8px';
        resetBtn.style.padding = '6px 12px';
        resetBtn.style.border = 'none';
        resetBtn.style.borderRadius = '6px';
        resetBtn.style.background = '#e5e7eb';
        resetBtn.style.cursor = 'pointer';
        resetBtn.onclick = resetConfig;
        configPanel.appendChild(resetBtn);

        document.body.appendChild(configPanel);
        createProductTable();
        createImagePreviewModal();
        updateLoginButtonStatus();
        loadCacheToTable();
        // 新增：更新标记已选按钮状态
        updateMarkSelectedButton();

        // 绑定自定义最低价格输入框引用
        customMinPriceInput = document.getElementById('customMinPrice');
        // 绑定FBA筛选复选框引用
        includeSelfFBACheckbox = document.getElementById('includeSelfFBA');
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
        document.getElementById('maxSellerThreshold').value = DEFAULT_CONFIG.maxSellerThreshold;
        document.getElementById('maxConcurrentPages').value = DEFAULT_CONFIG.maxConcurrentPages;
        // 清空自定义最低价格输入框并恢复默认值
        if (customMinPriceInput) {
            customMinPriceInput.value = currentSite.defaultMinPrice;
        }
        // 重置FBA筛选复选框
        if (includeSelfFBACheckbox) {
            includeSelfFBACheckbox.checked = DEFAULT_CONFIG.includeSelfFBA;
            currentConfig.includeSelfFBA = DEFAULT_CONFIG.includeSelfFBA;
        }
        log('已重置默认配置');
    }

    // ========== 表格 ==========
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

        const clearCacheBtn = document.createElement('button');
        clearCacheBtn.id = 'clearCacheBtn';
        clearCacheBtn.textContent = '清空缓存';
        clearCacheBtn.style.padding = '8px 16px';
        clearCacheBtn.style.background = '#ef4444';
        clearCacheBtn.style.color = '#fff';
        clearCacheBtn.style.border = 'none';
        clearCacheBtn.style.borderRadius = '6px';
        clearCacheBtn.onclick = () => {
            if (!storeId) return alert('未检测到店铺ID');
            if (confirm(`确定清空店铺${storeId}的缓存？`)) {
                clearStoreCache(storeId);
            }
        };

        bar.appendChild(t);
        bar.appendChild(clearCacheBtn);
        c.appendChild(bar);

        const tableWrap = document.createElement('div');
        tableWrap.style.flex = 1;
        tableWrap.style.overflow = 'auto';
        tableWrap.style.border = '1px solid #eee';
        tableWrap.style.borderRadius = '8px';

        productTable = document.createElement('table');
        productTable.style.width = '100%';
        productTable.style.borderCollapse = 'collapse';
        productTable.style.fontSize = '13px';
        productTable.style.tableLayout = 'fixed';

        const thead = document.createElement('thead');
        thead.style.position = 'sticky';
        thead.style.top = '0';
        thead.style.zIndex = '10';
        thead.style.background = '#f6f7f9';

        const tr = document.createElement('tr');
        // 需求1：增加重量列
        const heads = ['ASIN', '图片', '标题', '重量(克)', '跟卖数', '价格', '大类排名', '小类排名', '英', '德', '法', '意', '西'];
        const colWidths = ['80px', '80px', '280px', '90px', '70px', '90px', '100px', '100px', '50px', '50px', '50px', '50px', '50px'];
        const sortableColumns = { 4: 'sellerCount', 5: 'price', 7: 'smallRank', 8: 'sales' }; // 调整排序列索引

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
            if (sortableColumns[i]) {
                th.style.cursor = 'pointer';
                th.style.position = 'relative';
                th.classList.add('sortable-th');
                const arrow = document.createElement('span');
                arrow.style.position = 'absolute';
                arrow.style.right = '5px';
                arrow.style.top = '50%';
                arrow.style.transform = 'translateY(-50%)';
                arrow.style.fontSize = '10px';
                arrow.innerHTML = ' ↕';
                th.appendChild(arrow);
                th.addEventListener('click', () => {
                    sortByColumn(sortableColumns[i]);
                });
            }
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

    function sortByColumn(column) {
        if (productData.length === 0) return;
        if (sortConfig.column === column) {
            sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
        } else {
            sortConfig.column = column;
            sortConfig.direction = 'asc';
        }
        const sorted = [...productData];
        const dir = sortConfig.direction === 'asc' ? 1 : -1;
        switch (column) {
            case 'sellerCount':
                sorted.sort((a, b) => (a.sellerCount - b.sellerCount) * dir);
                break;
            case 'price':
                sorted.sort((a, b) => (a.minPrice - b.minPrice) * dir);
                break;
            case 'smallRank':
                sorted.sort((a, b) => {
                    const ra = a.smallRank?.Rank ? parseInt(a.smallRank.Rank) : 999999;
                    const rb = b.smallRank?.Rank ? parseInt(b.smallRank.Rank) : 999999;
                    return (ra - rb) * dir;
                });
                break;
            case 'sales':
                sorted.sort((a, b) => {
                    const sa = (a.sales.GB || 0) + (a.sales.DE || 0) + (a.sales.FR || 0) + (a.sales.IT || 0) + (a.sales.ES || 0);
                    const sb = (b.sales.GB || 0) + (b.sales.DE || 0) + (b.sales.FR || 0) + (b.sales.IT || 0) + (b.sales.ES || 0);
                    return (sa - sb) * dir;
                });
                break;
        }
        clearProductTable();
        sorted.forEach(p => addProductToTable(p));
        log(`已按${sortConfig.column}${sortConfig.direction === 'asc' ? '升序' : '降序'}排序`);
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

        // 60×60 透明底 + 红色大叉，绝对不会被当成产品图
        const noImageSvg = `data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Cline x1='16' y1='16' x2='44' y2='44' stroke='%23ff4444' stroke-width='5' stroke-linecap='round'/%3E%3Cline x1='44' y1='16' x2='16' y2='44' stroke='%23ff4444' stroke-width='5' stroke-linecap='round'/%3E%3C/svg%3E`;
        const imgTd = document.createElement('td');
        imgTd.style.padding = '8px';
        imgTd.style.textAlign = 'center';
        const img = document.createElement('img');
        img.src = p.thumb || noImageSvg;
        img.style.width = '60px';
        img.style.height = '60px';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '4px';
        img.style.cursor = 'pointer';
        img.onclick = () => showImagePreview(p.thumb);
        img.onerror = () => { img.src = noImageSvg; };
        imgTd.appendChild(img);
        row.appendChild(imgTd);

        const titleTd = document.createElement('td');
        titleTd.innerText = p.title || '';
        titleTd.style.maxWidth = '280px';
        titleTd.style.whiteSpace = 'nowrap';
        titleTd.style.overflow = 'hidden';
        titleTd.style.textOverflow = 'ellipsis';
        titleTd.style.padding = '8px';
        // 需求3：添加title属性，鼠标悬浮显示完整标题
        titleTd.title = p.title || '无标题';
        row.appendChild(titleTd);

        // 需求1：添加重量列展示
        const weightTd = document.createElement('td');
        weightTd.innerText = p.weightGram || '0.00';
        weightTd.style.padding = '8px';
        weightTd.style.textAlign = 'center';
        row.appendChild(weightTd);

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

        const bigRankTd = document.createElement('td');
        bigRankTd.innerText = p.bigRank ? `${p.bigRank.Title}\n${p.bigRank.Rank}` : '-';
        bigRankTd.style.padding = '8px';
        bigRankTd.style.textAlign = 'center';
        row.appendChild(bigRankTd);

        const smallRankTd = document.createElement('td');
        smallRankTd.innerText = p.smallRank ? `${p.smallRank.Title}\n${p.smallRank.Rank}` : '-';
        smallRankTd.style.padding = '8px';
        smallRankTd.style.textAlign = 'center';
        row.appendChild(smallRankTd);

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

    // ========== 业务 ==========
    function buildUrl(storeId, page) {
        return `https://www.${currentSite.domain}/s?i=merchant-items&s=exact-aware-popularity-rank&me=${storeId}&page=${page}`;
    }

    async function fetchPageAsins(storeId, page, retryCount = 0) {
        const MAX_RETRY = 5;
        if (abortFlag) return [];
        const url = buildUrl(storeId, page);
        log(`获取第${page}页${retryCount > 0 ? `（重试${retryCount}）` : ''}`);
        try {
            const r = await gmRequest({ method: 'GET', url });
            const doc = new DOMParser().parseFromString(r.responseText, 'text/html');
            const set = new Set();
            doc.querySelectorAll('[data-asin]').forEach(i => {
                const a = i.dataset.asin?.trim();
                if (a) set.add(a);
            });
            const asins = Array.from(set);
            // 解析当前页面的ASIN对应的图片和标题
            parseAmazonPageInfo(r.responseText, asins);
            log(`第${page}页：${asins.length}个ASIN`);
            return asins;
        } catch (e) {
            if (retryCount < MAX_RETRY) {
                log(`第${page}页失败：${e.message}`);
                await delay((retryCount + 1) * 5000);
                return fetchPageAsins(storeId, page, retryCount + 1);
            } else {
                log(`第${page}页失败：${e.message}`);
                return [];
            }
        }
    }

    function getDetailToken() {
        const zytoken = getZyToken();
        if (!zytoken) {
            handleZyLoginExpired();
            throw new Error('请先登录智赢');
        }
        return zytoken;
    }

    function getFingerId() {
        return GM_getValue("zying_fingerid", `auto_${Math.random().toString(36).substr(2, 16)}`);
    }

    async function getBatchSalesData(asins, cc) {
        const token = getDetailToken();
        if (!asins.length) return {};
        const ts = String(Math.floor(Date.now() / 1000));
        const data = JSON.stringify({ abbr: cc, pagesize: 200, keys: asins });
        const path = "/api/CmdHandler?cmd=zscout_asin.list";
        const signStr = data + "POST" + path + ts + token + "v1";
        const sign = CryptoJS.HmacSHA256(signStr, "https://amazon.zying.net").toString(CryptoJS.enc.Hex);
        try {
            const r = await gmRequest({
                method: 'POST',
                url: 'https://amazon.zying.net' + path,
                headers: {
                    'Content-Type': 'application/json',
                    'Token': token,
                    'Version': 'v1',
                    'Signature': sign,
                    'Timestamp': ts
                },
                data,
                timeout: 15000
            });
            const j = JSON.parse(r.responseText);
            if (j.code === 401) { handleZyLoginExpired(); return {}; }
            const map = {};
            (j.data?.list || []).forEach(it => {
                map[it.asin] = { sales: it.sales || 0, thumb: it.thumb || '', title: it.title || '' };
            });
            return map;
        } catch (e) {
            if (e.message.includes('401')) handleZyLoginExpired();
            log(`获取销量失败：${e.message}`);
            return {};
        }
    }

    async function getBatchAsinDetail(asins, cc, retryCount = 0) {
        const token = getDetailToken();
        const fingerid = getFingerId();
        const MAX_RETRY = 3;
        if (!asins.length) return {};
        await delay(2000);
        const ts = String(Math.floor(Date.now() / 1000));
        const data = JSON.stringify(asins.map(a => ({ asin: a })));
        const path = `/api/zbig/MoreAboutAsin/v2/${cc.toLowerCase()}`;
        const signStr = data + "POST" + path + ts + token + "v1";
        const sign = CryptoJS.HmacSHA256(signStr, "https://amazon.zying.net").toString(CryptoJS.enc.Hex);
        try {
            const r = await gmRequest({
                method: 'POST',
                url: 'https://amazon.zying.net' + path,
                headers: {
                    'Content-Type': 'application/json',
                    'Token': token,
                    'Version': 'v1',
                    'Signature': sign,
                    'Timestamp': ts,
                    'Ext_version': '5.0.56',
                    'Appclient': '3',
                    'Client_identify': fingerid,
                    'Origin': 'chrome-extension://pembniiibielncgmegepmgcbkieljieh',
                    'Referer': 'chrome-extension://pembniiibielncgmegepmgcbkieljieh/'
                },
                data,
                timeout: 15000
            });
            const res = JSON.parse(r.responseText);
            if (res.code === 401||res.code === 429) { handleZyLoginExpired(); return {}; }
            return res;
        } catch (e) {
            if (e.message.includes('401')) { handleZyLoginExpired(); }
            else if ((e.message.includes('429') || e.message.includes('426')) && retryCount < MAX_RETRY) {
                await delay((retryCount + 1) * 40000);
                return getBatchAsinDetail(asins, cc, retryCount + 1);
            } else if (retryCount >= MAX_RETRY) {
                abortFlag = true;
                showCopyToast('请求频繁，稍后再试');
            }
            log(`获取详情失败：${e.message}`);
            return {};
        }
    }

    // ========== 核心筛选逻辑（支持自定义最低价格+图片/标题兜底） ==========
    function processSingleAsin(asin, detailData, salesMap) {
        const d = detailData.data?.[asin] || detailData[asin] || {};
        const offers = d.Offers || [];
        const sellerId = d.SellerId || '';

        const self = offers.find(o => o.SellerId === sellerId);
        const isSelfFBA = !!self && self.IsFba === true;

        const brandList = d.BrandSourceDetails || [];
        const brandRegistered =
              brandList.filter(i => ['GB', 'DE', 'FR', 'IT', 'ES'].includes(i.Source) && i.Status === '已注册').length >= 2
        || brandList.some(i => i.Source === currentSite.code && i.Status === '已注册')
        || brandList.length > 5;

        const prices = offers.map(o => o.Listing).filter(x => x > 0);
        const minPrice = prices.length ? Math.min(...prices) : 0;
        const currency = offers[0]?.Currency || currentSite.currency;

        const bsr = d.BSR || [];
        let smallRank = bsr[0] || null;
        let bigRank = bsr[1] || null;

        const si = salesMap.GB?.[asin] || {};

        // 需求1：获取重量并转换单位
        const packageWeight = d.PackageWeight || 0; // 磅
        const weightGram = poundToGram(packageWeight); // 转为克，保留2位小数

        // 图片/标题兜底逻辑：先取salesMap，再取亚马逊页面解析的，最后为空
        const thumb = si.thumb || asinAmazonInfoMap[asin]?.thumb || '';
        const title = si.title || asinAmazonInfoMap[asin]?.title || '';

        const product = {
            asin,
            title: title,
            thumb: thumb,
            weightGram, // 新增重量字段
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

        // 获取最终使用的最低价格（自定义优先）
        const minPriceThreshold = getFinalMinPrice();
        log(`当前筛选门槛：${minPriceThreshold} ${currentSite.currency}`);

        // 修改：根据配置决定是否包含FBA商品
        const fbaCondition = currentConfig.includeSelfFBA ? true : !product.isSelfFBA;

        const ok =
              minPrice >= minPriceThreshold
        && offers.length <= currentConfig.maxSellerThreshold
        && (product.sales.GB + product.sales.DE + product.sales.FR + product.sales.IT + product.sales.ES) > 0
        && fbaCondition  // 使用配置的FBA筛选条件
        && !brandRegistered;

        return { product, isQualified: ok };
    }

    async function processAsinBatch(batch) {
        if (!batch.length || abortFlag) return;
        const ccList = ['GB', 'DE', 'FR', 'IT', 'ES'];
        const salesMaps = {};
        for (const cc of ccList) {
            salesMaps[cc] = await getBatchSalesData(batch, cc);
            if (abortFlag) return;
            await delay(300);
        }
        const detail = await getBatchAsinDetail(batch, currentSite.code);
        if (abortFlag) return;
        for (const asin of batch) {
            const r = processSingleAsin(asin, detail, salesMaps);
            if (r.isQualified) {
                log(`✅ 合格 ${asin} | 价格:${r.product.minPrice}${r.product.currency} | 跟卖:${r.product.sellerCount}`);
                addProductToTable(r.product);
                productData.push(r.product);
            } else {
                log(`❌ 不合格 ${asin} | 价格:${r.product.minPrice} | 跟卖:${r.product.sellerCount} | 品牌:${r.product.brandRegistered} | FBA:${r.product.isSelfFBA}| 销量:${r.product.sales.GB + r.product.sales.DE + r.product.sales.FR + r.product.sales.IT + r.product.sales.ES}`);
            }
        }
    }

    async function fetchPages(storeId, total, maxConcurrent) {
        const all = new Set();
        let page = 1;
        // 清空ASIN信息映射
        asinAmazonInfoMap = {};
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
        currentConfig.judgePages = +document.getElementById('judgePages').value || 5;
        currentConfig.maxSellerThreshold = +document.getElementById('maxSellerThreshold').value || 6;
        currentConfig.maxConcurrentPages = +document.getElementById('maxConcurrentPages').value || 3;
        // 读取FBA筛选配置
        currentConfig.includeSelfFBA = includeSelfFBACheckbox?.checked || DEFAULT_CONFIG.includeSelfFBA;

        // 打印当前使用的最低价格
        const finalMinPrice = getFinalMinPrice();
        log(`本次筛选最低价格门槛：${finalMinPrice} ${currentSite.currency}`);
        log(`本次筛选FBA配置：${currentConfig.includeSelfFBA ? '包含FBA' : '排除FBA'}`);

        isRunning = true;
        abortFlag = false;
        clearLog();
        clearProductTable();
        const startBtn = document.getElementById('startFilterBtn');
        const cancelBtn = document.getElementById('cancelFilterBtn');
        startBtn.disabled = true;
        cancelBtn.style.display = 'inline-block';

        try {
            getDetailToken();
            const asins = await fetchPages(storeId, currentConfig.judgePages, currentConfig.maxConcurrentPages);
            if (abortFlag) throw new Error('已终止');
            log(`共获取ASIN：${asins.length}`);
            for (let i = 0; i < asins.length; i += 16) {
                if (abortFlag) break;
                await processAsinBatch(asins.slice(i, i + 16));
                await delay(2000);
            }
            saveStoreCache(storeId, productData);
            log(`筛选完成，合格：${productData.length} 个`);
            alert(`完成！合格 ${productData.length} 个`);
        } catch (e) {
            log(`失败：${e.message}`);
            alert(`失败：${e.message}`);
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
        log('初始化完成');
    }

    if (document.readyState === 'complete') init();
    else window.addEventListener('load', init);

})();
