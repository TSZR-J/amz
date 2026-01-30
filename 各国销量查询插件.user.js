// ==UserScript==
// @name         各国销量查询插件
// @namespace    http://tampermonkey.net/
// @version      1.0.7
// @description  查询各国销量（批量请求优化版）
// @author       LHH
// @downloadURL  https://raw.githubusercontent.com/TSZR-J/amz/main/各国销量查询插件.user.js
// @updateURL    https://raw.githubusercontent.com/TSZR-J/amz/main/各国销量查询插件.user.js
// @match        *://*/*
// @grant        GM.xmlHttpRequest
// @connect      amazon.zying.net
// @require      https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 解析国家
    const domain = new URL(window.location.href).hostname;

    function removeQuotes(str) {
        if (typeof str !== 'string') {
            return str;
        }
        // 去除开头和结尾的引号
        if (str.startsWith('"') && str.endsWith('"')) {
            return str.slice(1, -1);
        }
        return str;
    }

    let token;
    // 判断是否智赢链接
    if (domain === 'amazon.zying.net') {
        token = localStorage.getItem("token");
        GM_setValue("token", removeQuotes(token));
    }

    // 监听SKU变化
    document.addEventListener('click', (event) => {
        const target = event.target;
        // 元素类型检测
        const elementInfo = {
            tagName: target.tagName,
            id: target.id || '无ID',
            classList: target.classList.value || '无class',
            href: target.href || '非链接元素'
        };

        // 控制台输出点击信息
        console.group('点击事件详情');
        console.log('触发元素:', target);
        console.log('元素类型:', elementInfo.tagName);
        console.log('元素标识:', {
            id: elementInfo.id,
            class: elementInfo.classList
        });
        console.groupEnd();

        let asin = null;
        if (target.classList.value === 's-pagination-item s-pagination-previous s-pagination-button s-pagination-button-accessibility s-pagination-separator') {
            console.log("上一页");
            setTimeout(init, 3500);
        }
        if (target.classList.value === 's-pagination-item s-pagination-next s-pagination-button s-pagination-button-accessibility s-pagination-separator') {
            console.log("下一页");
            setTimeout(init, 3500);
        }
        if (target.classList.value === 's-pagination-item s-pagination-button s-pagination-button-accessibility') {
            console.log("数字");
            setTimeout(init, 3500);
        }
        if (target.classList.value === 'a-dropdown-link') {
            console.log("下拉框");
            setTimeout(init, 3500);
        }
        if (target.classList.value === 'a-dropdown-link a-active') {
            console.log("下拉框");
            setTimeout(init, 3500);
        }
    });

    // 创建亚马逊站点数据数组
    const amazonSites = [
        {
            add: "https://www.amazon.it/dp/",
            name: "意大利(IT)",
            code: "IT"
        },
        {
            add: "https://www.amazon.fr/dp/",
            name: "法国(FR)",
            code: "FR"
        },
        {
            add: "https://www.amazon.co.uk/dp/",
            name: "英国(GB)",
            code: "GB"
        },
        {
            add: "https://www.amazon.de/dp/",
            name: "德国(DE)",
            code: "DE"
        },
        {
            add: "https://www.amazon.es/dp/",
            name: "西班牙(ES)",
            code: "ES"
        }
    ];

    // 1. 配置区域 - 请根据实际页面调整选择器
    const TARGET_DIV_SELECTOR = 'div#target-container'; // 指定div的选择器
    const API_URL = 'https://amazon.zying.net/api/CmdHandler?cmd=zscout_asin.list';

    // 2. 核心功能实现（批量请求优化版）
    async function init() {
        await sleep(3500); // 延迟3.5秒（使用await保证延迟生效，原sleep是Promise，直接调用不等待）
        // 获取所有role为listitem的div
        const listItems = document.querySelectorAll('div[role="listitem"]');
        if (listItems.length === 0) {
            console.warn(' 未找到任何listitem元素');
            return;
        }

        // 获取最大data-index确定循环次数
        const indexes = Array.from(listItems).map(item => {
            const index = item.dataset.index;
            return index ? parseInt(index, 10) : -1;
        });
        const maxIndex = Math.max(...indexes);
        console.log(` 检测到最大索引: ${maxIndex}，共${listItems.length} 个项目`);

        // 关键修改1：收集批量数据 - 去重ASIN数组 + ASIN与item的映射对象
        const asinItemMap = new Map(); // 映射关系：key=asin，value=item（保证ASIN唯一）
        const asinList = []; // 去重后的ASIN数组，用于批量请求

        listItems.forEach((item, index) => {
            const asin = item.dataset.asin;
            if (!asin) {
                console.warn(` 第${index+1}个listitem缺少data-asin属性`);
                return;
            }

            // 去重处理，避免重复请求相同ASIN
            if (!asinItemMap.has(asin)) {
                asinItemMap.set(asin, item);
                asinList.push(asin);
            }
        });

        // 关键修改2：遍历各个站点，对每个站点发送批量ASIN请求
        for (let i = 0; i < amazonSites.length; i++) {
            const site = amazonSites[i];
            // 批量发送ASIN请求（一个站点一次请求，包含所有ASIN）
            sendBatchAsinRequest(site, asinList, asinItemMap);
        }
    }

    // 3. 添加美观的蓝色ASIN标签（保留原有逻辑，无修改）
    function addAsinLabel(arr, element, asin, name, sales) {
        const labelStyle_g = `
        display: inline-block;
        padding: 2px 8px;
        margin-right: 8px;
        background-color: #22C55E;
        color: white;
        font-size: 12px;
        font-weight: bold;
        border-radius: 4px;
        vertical-align: middle;
        text-decoration: none;  // 添加此行去除下划线
    `;

        const labelStyle_r = `
        display: inline-block;
        padding: 2px 8px;
        margin-right: 8px;
        background-color: #94A3B8;
        color: white;
        font-size: 12px;
        font-weight: bold;
        border-radius: 4px;
        vertical-align: middle;
        text-decoration: none;  // 添加此行去除下划线
    `;
        // 创建a标签并设置跳转链接
        const label = document.createElement('a');
        label.href = arr + asin;  // 跳转到对应亚马逊站点
        label.target = '_blank';  // 在新标签页打开
        if (sales > 0) {
            label.style.cssText = labelStyle_g;
        } else {
            label.style.cssText = labelStyle_r;
        }
        label.textContent = ` ${name}销量: ${sales}`;

        // 在元素最前面插入标签
        if (element.firstChild) {
            element.insertBefore(label, element.firstChild);
        } else {
            element.appendChild(label);
        }
    }

    // 4. 解析批量返回的sales数据（适配接口返回的数组结果）
    function getBatchSalesData(data) {
        // 接口返回的list是批量ASIN的结果数组，直接返回该数组（方便后续按ASIN匹配）
        if (data && data.data && Array.isArray(data.data.list)) {
            return data.data.list;
        }
        return [];
    }

    // 5. 发送批量ASIN请求（核心修改：一次性发送多个ASIN）
    function sendBatchAsinRequest(site, asinList, asinItemMap) {
        // 获取token
        let Token = GM_getValue("token", "");
        if (!Token) {
            console.warn(' 未获取到有效Token，请求可能失败');
        }

        // 获取时间戳
        let Timestamp = Math.round(new Date().getTime() / 1e3).toString();

        // 关键修改：data中的keys传入批量ASIN数组
        let data = JSON.stringify({
            abbr: site.code,
            pagesize: 100, // 可根据实际需求调整，确保大于asinList长度
            keys: asinList // 批量ASIN数组，替代原单个ASIN
        });

        // 获取版本
        let Version = "v1";

        // 获取url
        let post_url = "https://amazon.zying.net";

        // 获取请求方法
        let post_method = "POST";

        // 组装验签字符串
        let Signature = data + post_method + "/api/CmdHandler?cmd=zscout_asin.list" + Timestamp + Token + Version;

        // 验签
        Signature = CryptoJS.HmacSHA256(Signature, post_url).toString(CryptoJS.enc.Hex);

        GM.xmlHttpRequest({
            method: 'POST',
            url: 'https://amazon.zying.net/api/CmdHandler?cmd=zscout_asin.list',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': document.cookie,
                'Token': Token,
                'Version': Version,
                'Signature': Signature,
                'Timestamp': Timestamp
            },
            data: data,
            onload: function(response) {
                let responseData = JSON.parse(response.responseText);

                // 处理登录失效
                if (responseData.code === 401) {
                    // 遍历所有item，添加登录失效提示
                    asinItemMap.forEach((item, asin) => {
                        addAsinLabel("https://amazon.zying.net/#/login", item, asin, '智赢插件登录失效，请跳转重新登录', 0);
                    });
                    return;
                }

                // 处理接口返回成功，获取批量销量数据数组
                const batchSalesList = getBatchSalesData(responseData);
                console.log(` 站点${site.name}批量返回结果:`, batchSalesList);

                // 关键修改3：遍历批量结果，通过ASIN匹配对应的item，添加标签
                batchSalesList.forEach(salesItem => {
                    const currentAsin = salesItem.asin; // 接口返回结果中的ASIN（需确认接口返回字段为asin，若不一致请调整）
                    const salesValue = salesItem.sales || 0; // 提取对应销量

                    // 匹配预存的item
                    if (asinItemMap.has(currentAsin)) {
                        const targetItem = asinItemMap.get(currentAsin);
                        // 执行标签添加逻辑
                        addAsinLabel(site.add, targetItem, currentAsin, site.name, salesValue);
                    }
                });

                // 处理接口返回中没有的ASIN（销量默认为0）
                asinList.forEach(asin => {
                    if (!batchSalesList.some(item => item.asin === asin)) {
                        const targetItem = asinItemMap.get(asin);
                        addAsinLabel(site.add, targetItem, asin, site.name, 0);
                    }
                });
            },
            onerror: function(error) {
                console.error(` 站点${site.name}批量请求失败:`, error);
                // 请求失败时，给所有item添加默认0销量标签
                asinItemMap.forEach((item, asin) => {
                    addAsinLabel(site.add, item, asin, site.name, 0);
                });
            }
        });
    }

    // 6. 页面加载完成后执行
    window.addEventListener('load', init);
})();
