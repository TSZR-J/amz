// ==UserScript==
// @name         ASIN销量查询（弹窗版）
// @namespace    http://tampermonkey.net/
// @version      1.8
// @description  任意网页底部添加ASIN销量查询按钮，弹窗内完成查询并表格展示结果，ASIN单元格支持点击复制，规格列=color-size+表格滚动条
// @author       You
// @downloadURL  https://raw.githubusercontent.com/TSZR-J/amz/main/ASIN销量批量查询.user.js
// @updateURL    https://raw.githubusercontent.com/TSZR-J/amz/main/ASIN销量批量查询.user.js
// @match        *://*/*
// @grant        GM.xmlHttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @connect      amazon.zying.net
// @require      https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js
// ==/UserScript==

(function() {
    'use strict';

    // ========== 1. 注入全局样式 ==========
    GM_addStyle(`
        /* 底部触发按钮 */
        #asinQueryBtn {
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 12px 30px;
            background: #0078d7;
            color: white;
            border: none;
            border-radius: 4px;
            font-size: 16px;
            cursor: pointer;
            z-index: 9998;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            transition: background 0.3s;
        }
        #asinQueryBtn:hover {
            background: #005a9e;
        }

        /* 弹窗遮罩 */
        #asinQueryModalMask {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 9999;
            display: none;
        }

        /* 弹窗容器 */
        #asinQueryModal {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 95%;
            max-width: 1000px;
            background: #f5f5f5;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            z-index: 10000;
            display: none;
            max-height: 80vh;
            overflow-y: auto;
        }

        /* 弹窗关闭按钮 */
        #modalCloseBtn {
            position: absolute;
            top: 15px;
            right: 15px;
            width: 30px;
            height: 30px;
            line-height: 30px;
            text-align: center;
            background: #eee;
            border-radius: 50%;
            cursor: pointer;
            font-size: 18px;
            color: #666;
            z-index: 10001;
        }
        #modalCloseBtn:hover {
            background: #ddd;
            color: #333;
        }

        /* 表单样式 */
        .modal-form-group {
            margin-bottom: 20px;
        }
        .modal-form-group label {
            display: block;
            font-weight: bold;
            margin-bottom: 8px;
            color: #333;
            font-size: 14px;
        }
        .modal-form-group textarea {
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
            box-sizing: border-box;
            height: 120px;
            resize: vertical;
            line-height: 1.5;
        }

        /* 查询按钮 */
        #modalQueryBtn {
            padding: 10px 25px;
            background: #0078d7;
            color: white;
            border: none;
            border-radius: 4px;
            font-size: 14px;
            cursor: pointer;
            transition: background 0.3s;
            margin-bottom: 20px;
        }
        #modalQueryBtn:hover {
            background: #005a9e;
        }

        /* 表格容器 - 固定表头+tbody滚动 */
        .table-container {
            width: 100%;
            background: #fff;
            border-radius: 4px;
            border: 1px solid #ddd;
            max-height: 400px;
            overflow: hidden;
        }
        #resultTable {
            width: 100%;
            border-collapse: collapse;
            text-align: center;
            table-layout: fixed;
        }
        #resultTable thead {
            position: sticky;
            top: 0;
            z-index: 10;
        }
        #resultTable th {
            background: #0078d7;
            color: white;
            padding: 12px 8px;
            font-weight: bold;
            font-size: 14px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        #resultTable tbody {
            display: block;
            width: 100%;
            max-height: 350px;
            overflow-y: auto;
        }
        #resultTable thead tr, #resultTable tbody tr {
            display: table;
            width: 100%;
            table-layout: fixed;
        }
        #resultTable td {
            padding: 10px 8px;
            border: 1px solid #ddd;
            font-size: 13px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        #resultTable tr:nth-child(even) {
            background: #f9f9f9;
        }
        #resultTable tr:hover {
            background: #f0f7ff;
        }
        .tip-text {
            padding: 10px;
            text-align: center;
            color: #666;
            font-size: 14px;
        }

        /* ASIN单元格复制样式 */
        .asin-cell {
            cursor: pointer;
            color: #0078d7;
            text-decoration: underline;
            user-select: none;
        }
        .asin-cell:hover {
            color: #005a9e;
            text-decoration: none;
        }

        /* 复制成功提示框样式 */
        .copy-toast {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0,0,0,0.7);
            color: white;
            padding: 12px 24px;
            border-radius: 6px;
            font-size: 14px;
            z-index: 10002;
            display: none;
            opacity: 0;
            transition: opacity 0.3s ease;
        }
    `);

    // ========== 2. 核心配置 ==========
    // 亚马逊站点配置（索引已适配规格列在第二列）
    const amazonSites = [
        { name: "英国", code: "GB", colIndex: 2 },
        { name: "法国", code: "FR", colIndex: 3 },
        { name: "德国", code: "DE", colIndex: 4 },
        { name: "意大利", code: "IT", colIndex: 5 },
        { name: "西班牙", code: "ES", colIndex: 6 }
    ];
    // 规格列索引（第二列）
    const SIZE_COL_INDEX = 1;
    // API接口地址
    const API_URL = 'https://amazon.zying.net/api/CmdHandler?cmd=zscout_asin.list';
    // 存储ASIN行元素映射
    let asinRowMap = new Map();

    // ========== 3. 工具函数 ==========
    /**
     * 移除字符串首尾的引号
     * @param {string} str - 待处理字符串
     * @returns {string} 处理后的字符串
     */
    function removeQuotes(str) {
        if (typeof str !== 'string') return str;
        if (str.startsWith('"') && str.endsWith('"')) {
            return str.slice(1, -1);
        }
        return str;
    }

    /**
     * 复制文本到剪贴板
     * @param {string} text - 要复制的文本（ASIN码）
     * @returns {boolean} 是否复制成功
     */
    function copyTextToClipboard(text) {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(text);
            } else {
                const textArea = document.createElement('textarea');
                textArea.value = text;
                textArea.style.position = 'fixed';
                textArea.style.top = '0';
                textArea.style.left = '0';
                textArea.style.opacity = '0';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
            }
            return true;
        } catch (err) {
            console.error('ASIN复制失败:', err);
            alert('复制失败，请手动复制ASIN！');
            return false;
        }
    }

    /**
     * 显示复制成功提示框
     * @param {string} asin - 复制的ASIN码
     */
    function showCopyToast(asin) {
        let toast = document.getElementById('copyToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'copyToast';
            toast.className = 'copy-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = `【${asin}】复制成功`;
        toast.style.display = 'block';
        toast.style.opacity = '1';
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => {
                toast.style.display = 'none';
            }, 300);
        }, 2000);
    }

    /**
     * 拼接color和size（核心修改：处理空值）
     * @param {string} color - 颜色值（item.color）
     * @param {string} size - 尺寸值（item.size）
     * @returns {string} 拼接后的规格字符串
     */
    function getCombinedSpec(color, size) {
        // 去除首尾空格，统一空值判断
        const cleanColor = (color || '').trim();
        const cleanSize = (size || '').trim();

        // 空值处理逻辑
        if (!cleanColor && !cleanSize) {
            return '无数据'; // 两者都空
        } else if (!cleanColor) {
            return cleanSize; // 只有size有值
        } else if (!cleanSize) {
            return cleanColor; // 只有color有值
        } else {
            return `${cleanColor}-${cleanSize}`; // 两者都有值，拼接
        }
    }

    /**
     * 清空表格并初始化ASIN行（ASIN→规格→5个国家）
     * @param {array} asins - ASIN数组
     */
    function initAsinTable(asins) {
        const tableBody = document.getElementById('tableBody');
        tableBody.innerHTML = '';
        asinRowMap.clear();

        // 无ASIN时显示提示
        if (asins.length === 0) {
            const tipRow = document.createElement('tr');
            const tipCell = document.createElement('td');
            tipCell.colSpan = 7;
            tipCell.className = 'tip-text';
            tipCell.textContent = "暂无ASIN数据";
            tipRow.appendChild(tipCell);
            tableBody.appendChild(tipRow);
            return;
        }

        // 遍历ASIN创建行
        asins.forEach(asin => {
            const row = document.createElement('tr');

            // 1. ASIN列（第0列）- 点击复制
            const asinCell = document.createElement('td');
            asinCell.textContent = asin;
            asinCell.className = 'asin-cell';
            asinCell.addEventListener('click', () => {
                if (copyTextToClipboard(asin)) {
                    showCopyToast(asin);
                }
            });
            row.appendChild(asinCell);

            // 2. 规格列（第1列）- 默认无数据
            const sizeCell = document.createElement('td');
            sizeCell.textContent = '无数据';
            row.appendChild(sizeCell);

            // 3-7列：英国、法国、德国、意大利、西班牙（默认无数据）
            for (let i = 0; i < 5; i++) {
                const countryCell = document.createElement('td');
                countryCell.textContent = '无数据';
                row.appendChild(countryCell);
            }

            // 添加行到表格
            tableBody.appendChild(row);
            asinRowMap.set(asin, row);
        });
    }

    /**
     * 更新指定ASIN的指定国家销量
     * @param {string} asin - ASIN码
     * @param {string} code - 站点code（GB/FR/DE/IT/ES）
     * @param {string|number} sales - 销量（item.sales）
     */
    function updateAsinSales(asin, code, sales) {
        if (!asinRowMap.has(asin)) return;
        const row = asinRowMap.get(asin);
        const site = amazonSites.find(item => item.code === code);
        if (!site) return;

        const cell = row.cells[site.colIndex];
        cell.textContent = sales || '无数据';
        if (sales === '请求失败') {
            cell.style.color = '#ff4444';
        }
    }

    /**
     * 更新指定ASIN的规格信息（核心修改：接收拼接后的规格）
     * @param {string} asin - ASIN码
     * @param {string} spec - 拼接后的规格字符串
     */
    function updateAsinSize(asin, spec) {
        if (!asinRowMap.has(asin)) return;
        const row = asinRowMap.get(asin);
        const sizeCell = row.cells[SIZE_COL_INDEX];
        sizeCell.textContent = spec || '无数据';
    }

    // ========== 4. 核心查询逻辑 ==========
    /**
     * 发送ASIN查询请求
     * @param {object} site - 站点信息
     * @param {array} asins - ASIN数组
     * @param {string} token - 智赢Token
     */
    function sendAsinRequest(site, asins, token) {
        const timestamp = Math.round(new Date().getTime() / 1000).toString();
        const requestData = JSON.stringify({
            abbr: site.code,
            pagesize: 100,
            keys: asins
        });
        const version = "v1";
        const postUrl = "https://amazon.zying.net";
        const method = "POST";
        const apiPath = "/api/CmdHandler?cmd=zscout_asin.list";

        const signStr = requestData + method + apiPath + timestamp + token + version;
        const signature = CryptoJS.HmacSHA256(signStr, postUrl).toString(CryptoJS.enc.Hex);

        GM.xmlHttpRequest({
            method: 'POST',
            url: API_URL,
            headers: {
                'Content-Type': 'application/json',
                'Token': token,
                'Version': version,
                'Signature': signature,
                'Timestamp': timestamp,
                'Cookie': document.cookie
            },
            data: requestData,
            onload: function(response) {
                const data = JSON.parse(response.responseText);
                if (data.code === 401) {
                    asins.forEach(asin => updateAsinSales(asin, site.code, '智赢选品登录失效，请重新登录'));
                    return;
                }

                if (!data.data || !data.data.list || data.data.list.length === 0) {
                    return;
                }

                // 遍历更新销量+规格（核心修改：调用拼接函数）
                data.data.list.forEach(item => {
                    updateAsinSales(item.asin, site.code, item.sales);
                    // 仅英国站点请求时更新规格，避免重复
                    if (site.code === 'GB') {
                        // 拼接color和size，处理空值
                        const combinedSpec = getCombinedSpec(item.color, item.size);
                        updateAsinSize(item.asin, combinedSpec);
                    }
                });
            },
            onerror: function(error) {
                asins.forEach(asin => updateAsinSales(asin, site.code, '请求失败'));
                console.error(`查询${site.name}失败：`, error);
            }
        });
    }

    /**
     * 初始化查询流程
     */
    function initQuery() {
        const token = GM_getValue("token", "");
        const asinInput = document.getElementById('modalAsinInput');
        const asinText = asinInput.value.trim();
        if (!asinText) {
            alert("请输入需要查询的ASIN码（一行一个）！");
            return;
        }
        const asins = asinText.split('\n')
                             .map(line => line.trim())
                             .filter(line => line.length > 0);

        initAsinTable(asins);
        amazonSites.forEach(site => {
            sendAsinRequest(site, asins, token);
        });
    }

    // ========== 5. 渲染DOM ==========
    function renderDOM() {
        // 创建底部触发按钮
        const bottomBtn = document.createElement('button');
        bottomBtn.id = 'asinQueryBtn';
        bottomBtn.textContent = 'ASIN销量查询';
        document.body.appendChild(bottomBtn);

        // 创建弹窗遮罩
        const modalMask = document.createElement('div');
        modalMask.id = 'asinQueryModalMask';
        document.body.appendChild(modalMask);

        // 创建弹窗主体
        const modal = document.createElement('div');
        modal.id = 'asinQueryModal';
        modal.innerHTML = `
            <div id="modalCloseBtn">×</div>
            <h3 style="margin-bottom:20px;color:#333;font-size:18px;text-align:center;">ASIN销量查询工具</h3>

            <div class="modal-form-group">
                <label for="modalAsinInput">ASIN输入（一行一个）：</label>
                <textarea id="modalAsinInput" placeholder="例如：
B08XXXXXXX
B09XXXXXXX"></textarea>
            </div>

            <button id="modalQueryBtn">开始查询</button>

            <div class="modal-form-group">
                <label>查询结果：</label>
                <div class="table-container">
                    <table id="resultTable">
                        <thead>
                            <tr>
                                <th>ASIN</th>
                                <th>规格</th>
                                <th>英国</th>
                                <th>法国</th>
                                <th>德国</th>
                                <th>意大利</th>
                                <th>西班牙</th>
                            </tr>
                        </thead>
                        <tbody id="tableBody">
                            <tr>
                                <td colspan="7" class="tip-text">输入ASIN后点击查询，结果将显示在这里...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // 绑定事件
        bottomBtn.addEventListener('click', () => {
            modalMask.style.display = 'block';
            modal.style.display = 'block';
        });

        modalMask.addEventListener('click', () => {
            modalMask.style.display = 'none';
            modal.style.display = 'none';
        });

        document.getElementById('modalCloseBtn').addEventListener('click', () => {
            modalMask.style.display = 'none';
            modal.style.display = 'none';
        });

        document.getElementById('modalQueryBtn').addEventListener('click', initQuery);
    }

    // 页面加载完成后渲染
    if (document.readyState === 'complete') {
        renderDOM();
    } else {
        window.addEventListener('load', renderDOM);
    }

})();
