// ==UserScript==
// @name         ASIN销量查询（弹窗版）
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  任意网页底部添加ASIN销量查询按钮，弹窗内完成查询并表格展示结果，ASIN单元格支持点击复制
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

    // ========== 1. 注入全局样式（弹窗、表格、按钮、复制提示等） ==========
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

        /* 表格容器 */
        .table-container {
            width: 100%;
            overflow-x: auto;
            background: #fff;
            border-radius: 4px;
            border: 1px solid #ddd;
        }
        #resultTable {
            width: 100%;
            border-collapse: collapse;
            text-align: center;
        }
        #resultTable th {
            background: #0078d7;
            color: white;
            padding: 12px 8px;
            font-weight: bold;
            font-size: 14px;
            white-space: nowrap;
        }
        #resultTable td {
            padding: 10px 8px;
            border: 1px solid #ddd;
            font-size: 13px;
            white-space: nowrap;
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

        /* ========== 新增：ASIN单元格复制样式 ========== */
        .asin-cell {
            cursor: pointer; /* 鼠标小手提示可点击 */
            color: #0078d7; /* 蓝色文字区分可点击 */
            text-decoration: underline; /* 下划线提示可点击 */
            user-select: none; /* 防止选中文字干扰 */
        }
        .asin-cell:hover {
            color: #005a9e; /* hover加深颜色 */
            text-decoration: none; /* hover取消下划线 */
        }

        /* ========== 新增：复制成功提示框样式 ========== */
        .copy-toast {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0,0,0,0.7); /* 半透明黑底 */
            color: white;
            padding: 12px 24px;
            border-radius: 6px;
            font-size: 14px;
            z-index: 10002; /* 层级高于弹窗 */
            display: none;
            opacity: 0;
            transition: opacity 0.3s ease; /* 渐变显示/隐藏 */
        }
    `);

    // ========== 2. 核心配置 ==========
    // 亚马逊站点配置（code与表头列映射）
    const amazonSites = [
        { name: "英国", code: "GB", colIndex: 1 }, // 第2列（ASIN是第0列）
        { name: "法国", code: "FR", colIndex: 2 }, // 第3列
        { name: "德国", code: "DE", colIndex: 3 }, // 第4列
        { name: "意大利", code: "IT", colIndex: 4 }, // 第5列
        { name: "西班牙", code: "ES", colIndex: 5 }  // 第6列
    ];
    // API接口地址
    const API_URL = 'https://amazon.zying.net/api/CmdHandler?cmd=zscout_asin.list';
    // 存储ASIN行元素映射（便于后续更新销量）
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
     * ========== 新增：复制文本到剪贴板 ==========
     * @param {string} text - 要复制的文本（ASIN码）
     * @returns {boolean} 是否复制成功
     */
    function copyTextToClipboard(text) {
        try {
            // 现代浏览器优先使用Clipboard API（安全上下文）
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(text);
            } else {
                // 兼容旧浏览器/非安全上下文（如本地文件）
                const textArea = document.createElement('textarea');
                textArea.value = text;
                // 隐藏textarea防止干扰界面
                textArea.style.position = 'fixed';
                textArea.style.top = '0';
                textArea.style.left = '0';
                textArea.style.opacity = '0';
                document.body.appendChild(textArea);
                // 选中并复制
                textArea.focus();
                textArea.select();
                document.execCommand('copy');
                // 移除临时元素
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
     * ========== 新增：显示复制成功提示框 ==========
     * @param {string} asin - 复制的ASIN码
     */
    function showCopyToast(asin) {
        let toast = document.getElementById('copyToast');
        // 不存在则创建提示框
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'copyToast';
            toast.className = 'copy-toast';
            document.body.appendChild(toast);
        }
        // 设置提示文本并显示
        toast.textContent = `【${asin}】复制成功`;
        toast.style.display = 'block';
        toast.style.opacity = '1';
        // 2秒后渐变隐藏
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => {
                toast.style.display = 'none';
            }, 300);
        }, 2000);
    }

    /**
     * 清空表格并初始化ASIN行（提前填充ASIN，各国列默认无数据）
     * @param {array} asins - ASIN数组
     */
    function initAsinTable(asins) {
        const tableBody = document.getElementById('tableBody');
        tableBody.innerHTML = ''; // 清空表格
        asinRowMap.clear(); // 清空行映射

        // 无ASIN时显示提示
        if (asins.length === 0) {
            const tipRow = document.createElement('tr');
            const tipCell = document.createElement('td');
            tipCell.colSpan = 6; // 6列表头
            tipCell.className = 'tip-text';
            tipCell.textContent = "暂无ASIN数据";
            tipRow.appendChild(tipCell);
            tableBody.appendChild(tipRow);
            return;
        }

        // 遍历ASIN，创建每行数据（默认各国列显示无数据）
        asins.forEach(asin => {
            const row = document.createElement('tr');

            // 1. ASIN列（第0列）- 新增点击复制功能
            const asinCell = document.createElement('td');
            asinCell.textContent = asin;
            asinCell.className = 'asin-cell'; // 添加可点击样式类
            // 绑定点击复制事件
            asinCell.addEventListener('click', () => {
                if (copyTextToClipboard(asin)) {
                    showCopyToast(asin); // 复制成功显示提示
                }
            });
            row.appendChild(asinCell);

            // 2-6列：英国、法国、德国、意大利、西班牙（默认无数据）
            for (let i = 0; i < 5; i++) {
                const countryCell = document.createElement('td');
                countryCell.textContent = '无数据';
                row.appendChild(countryCell);
            }

            // 添加行到表格
            tableBody.appendChild(row);
            // 存储行元素（便于后续更新销量）
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
        // 找到对应国家的列索引
        const site = amazonSites.find(item => item.code === code);
        if (!site) return;

        // 更新对应列的销量（无数据则保持，请求失败显示提示）
        const cell = row.cells[site.colIndex];
        cell.textContent = sales || '无数据';
        if (sales === '请求失败') {
            cell.style.color = '#ff4444'; // 失败提示标红
        }
    }

    // ========== 4. 核心查询逻辑（适配油猴GM.xmlHttpRequest） ==========
    /**
     * 发送ASIN查询请求（油猴跨域版）
     * @param {object} site - 站点信息
     * @param {array} asins - ASIN数组
     * @param {string} token - 智赢Token
     */
    function sendAsinRequest(site, asins, token) {
        // 生成时间戳
        const timestamp = Math.round(new Date().getTime() / 1000).toString();
        // 构造请求数据
        const requestData = JSON.stringify({
            abbr: site.code,
            pagesize: 100,
            keys: asins
        });
        // 验签相关配置
        const version = "v1";
        const postUrl = "https://amazon.zying.net";
        const method = "POST";
        const apiPath = "/api/CmdHandler?cmd=zscout_asin.list";

        // 生成签名
        const signStr = requestData + method + apiPath + timestamp + token + version;
        const signature = CryptoJS.HmacSHA256(signStr, postUrl).toString(CryptoJS.enc.Hex);

        // 油猴跨域请求（替代fetch）
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
                // Token无效处理
                if (data.code === 401) {
                    // 该站点所有ASIN标记为请求失败
                    asins.forEach(asin => updateAsinSales(asin, site.code, '智赢选品登录失效，请重新登录'));
                    return;
                }

                // 无数据处理
                if (!data.data || !data.data.list || data.data.list.length === 0) {
                    // 该站点所有ASIN保持无数据（无需修改）
                    return;
                }

                // 遍历更新对应ASIN的对应国家销量（取item.sales）
                data.data.list.forEach(item => {
                    updateAsinSales(item.asin, site.code, item.sales);
                });
            },
            onerror: function(error) {
                // 请求失败，该站点所有ASIN标记为请求失败
                asins.forEach(asin => updateAsinSales(asin, site.code, '请求失败'));
                console.error(`查询${site.name}失败：`, error);
            }
        });
    }

    /**
     * 初始化查询流程
     */
    function initQuery() {
        // 从油猴本地存储获取Token
        const token = GM_getValue("token", "");
        // 获取并验证ASIN
        const asinInput = document.getElementById('modalAsinInput');
        const asinText = asinInput.value.trim();
        if (!asinText) {
            alert("请输入需要查询的ASIN码（一行一个）！");
            return;
        }
        // 解析ASIN（去空行、去空格）
        const asins = asinText.split('\n')
                             .map(line => line.trim())
                             .filter(line => line.length > 0);

        // 第一步：提前填充ASIN到表格（各国列默认无数据）
        initAsinTable(asins);

        // 第二步：遍历所有站点发送请求，更新对应国家销量
        amazonSites.forEach(site => {
            sendAsinRequest(site, asins, token);
        });
    }

    // ========== 5. 渲染DOM（底部按钮+弹窗） ==========
    function renderDOM() {
        // 1. 创建底部触发按钮
        const bottomBtn = document.createElement('button');
        bottomBtn.id = 'asinQueryBtn';
        bottomBtn.textContent = 'ASIN销量查询';
        document.body.appendChild(bottomBtn);

        // 2. 创建弹窗遮罩
        const modalMask = document.createElement('div');
        modalMask.id = 'asinQueryModalMask';
        document.body.appendChild(modalMask);

        // 3. 创建弹窗主体（6列表头）
        const modal = document.createElement('div');
        modal.id = 'asinQueryModal';
        modal.innerHTML = `
            <div id="modalCloseBtn">×</div>
            <h3 style="margin-bottom:20px;color:#333;font-size:18px;text-align:center;">ASIN销量查询工具</h3>

            <!-- ASIN富文本输入框 -->
            <div class="modal-form-group">
                <label for="modalAsinInput">ASIN输入（一行一个）：</label>
                <textarea id="modalAsinInput" placeholder="例如：
B08XXXXXXX
B09XXXXXXX"></textarea>
            </div>

            <!-- 弹窗内查询按钮 -->
            <button id="modalQueryBtn">开始查询</button>

            <!-- 结果表格（6列表头） -->
            <div class="modal-form-group">
                <label>查询结果：</label>
                <div class="table-container">
                    <table id="resultTable">
                        <thead>
                            <tr>
                                <th>ASIN</th>
                                <th>英国</th>
                                <th>法国</th>
                                <th>德国</th>
                                <th>意大利</th>
                                <th>西班牙</th>
                            </tr>
                        </thead>
                        <tbody id="tableBody">
                            <tr>
                                <td colspan="6" class="tip-text">输入ASIN后点击查询，结果将显示在这里...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // ========== 6. 绑定事件 ==========
        // 底部按钮点击 → 显示弹窗
        bottomBtn.addEventListener('click', () => {
            modalMask.style.display = 'block';
            modal.style.display = 'block';
        });

        // 关闭按钮/遮罩点击 → 隐藏弹窗
        modalMask.addEventListener('click', () => {
            modalMask.style.display = 'none';
            modal.style.display = 'none';
        });
        document.getElementById('modalCloseBtn').addEventListener('click', () => {
            modalMask.style.display = 'none';
            modal.style.display = 'none';
        });

        // 弹窗内查询按钮点击 → 执行查询
        document.getElementById('modalQueryBtn').addEventListener('click', initQuery);
    }

    // ========== 7. 页面加载完成后渲染 ==========
    if (document.readyState === 'complete') {
        renderDOM();
    } else {
        window.addEventListener('load', renderDOM);
    }

})();
