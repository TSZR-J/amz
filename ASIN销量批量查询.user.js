// ==UserScript==
// @name         ASIN销量查询（弹窗版）
// @namespace    http://tampermonkey.net/
// @version      3.2
// @description  保留zbig接口逻辑，修复跟卖颜色错乱
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

    // 基础配置
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
    const API_DETAIL_BASE_URL = 'https://amazon.zying.net/api/zbig/MoreAboutAsin/v2/'; // 保留zbig接口
    const ZYING_LOGIN_URL = 'https://amazon.zying.net/#/login';
    const BATCH_SIZE = 20;
    let selectedAsins = new Set();
    let asinRowMap = new Map();
    let asinSpecCache = new Map();
    const domain = new URL(window.location.href).hostname;

    // Token处理
    let token;
    if (domain === 'amazon.zying.net') {
        token = localStorage.getItem("token")?.replace(/"/g, '');
        GM_setValue("token", token);
    }

    // 店铺映射
    const sellerIdToPerson = new Map();
    [
        "A3KWBSYD24ALO0;彭旭", "A1AGUX0XE6RFS8;王华宇", "AZA23B0AA7OH7;彭雄",
        "A15TABY6SLL8U7;李海鹏", "A2S73B5VZ8N3U3;夏银雪", "A1IR2E8KFOWN3P;彭水香",
        "A3QPZVYNJ4UXDQ;郭冬明", "A1DJ37ELZU4KW0;韩花楠", "A1TYHNO3PSR3A;蒋争争",
        "APFZMLZJYIKF7;聂洪荣", "A1AGUX0XE6RFS8;梅咏秋", "A2P6E2J0V7PORA;舒蕾",
        "A2RRES2N4V5JX2;刘常青", "APOU9GGLPJWQG;刘浩瀚", "A1CUDD63ZN4763;刘景平",
        "A33FD7G7VE21R1;陈林秀", "A3HTYB8UR7TMOM;黄绍梅", "A3VF36OIAZNR4F;廖春花",
        "A5BKGE50S2UJL;彭苟根", "A3UQLIM14446WU;黄敏", "AKQJ5QVD5BN2H;黄金根",
        "A2NQ9DMPFHO4DN;钱春华", "A39X67PN5QRMCW;陈锡岚", "A29XASP7A4XURC;薛园琴",
        "A3RSZUJWT6AB2D;舒兵太", "A31N3IR8B0X213;吴双娥", "A1V0C5VU5N96HN;吴建贵"
    ].forEach(item => {
        const [id, name] = item.split(';');
        id && sellerIdToPerson.set(id.trim().toLowerCase(), name.trim());
    });

    // 样式（加固颜色）
    GM_addStyle(`
        #asinQueryBtn { position:fixed;bottom:20px;right:20px;padding:12px 30px;background:#0078d7;color:white;border:none;border-radius:4px;font-size:16px;cursor:pointer;z-index:9998; }
        #asinQueryModalMask { position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:none; }
        #asinQueryModal { position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:95%;max-width:1000px;background:#f5f5f5;border-radius:8px;padding:20px;box-shadow:0 4px 20px rgba(0,0,0,0.3);z-index:10000;display:none;max-height:80vh;overflow-y:auto; }
        #modalCloseBtn { position:absolute;top:15px;right:15px;width:30px;height:30px;line-height:30px;text-align:center;background:#eee;border-radius:50%;cursor:pointer;font-size:18px;color:#666; }
        .modal-form-group { margin-bottom:20px; }
        .modal-form-group label { display:block;font-weight:bold;margin-bottom:8px;color:#333;font-size:14px; }
        .modal-form-group textarea { width:100%;padding:10px;border:1px solid #ddd;border-radius:4px;font-size:14px;box-sizing:border-box;height:120px;resize:vertical; }
        .btn-group { display:flex;gap:12px;margin-bottom:20px; }
        #modalQueryBtn { padding:10px 25px;background:#0078d7;color:white;border:none;border-radius:4px;cursor:pointer; }
        #modalClearBtn { padding:10px 25px;background:#f56c6c;color:white;border:none;border-radius:4px;cursor:pointer; }
        #modalLoginBtn { padding:10px 25px;background:#67c23a;color:white;border:none;border-radius:4px;cursor:pointer; }
        .table-container { width:100%;background:#fff;border-radius:4px;border:1px solid #ddd;max-height:400px;overflow:hidden; }
        #resultTable { width:100%;border-collapse:collapse;text-align:center;table-layout:fixed; }
        #resultTable th { background:#0078d7;color:white;padding:12px 8px;font-weight:bold;font-size:14px; }
        #resultTable tbody { display:block;width:100%;max-height:350px;overflow-y:auto; }
        #resultTable thead tr, #resultTable tbody tr { display:table;width:100%;table-layout:fixed; }
        #resultTable td { padding:10px 8px;border:1px solid #ddd;font-size:13px; }
        .asin-cell { cursor:pointer;color:#0078d7;text-decoration:underline; }
        .asin-cell.selected { background:#409eff;color:white;font-weight:bold; }
        .copy-toast { position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.7);color:white;padding:12px 24px;border-radius:6px;font-size:14px;z-index:10002;display:none; }
        /* 跟卖颜色样式 */
        .seller-match-tip {
            margin-left:6px;
            font-size:12px;
            font-weight:bold !important;
        }
        .seller-green { color: #00b42a !important; } /* 已跟卖-绿色 */
        .seller-red { color: #ff4d4f !important; }   /* 未跟卖-红色 */
        .seller-gray { color: #909399 !important; }  /* 查询失败-灰色 */
    `);

    // 工具函数
    function copyTextToClipboard(text) {
        try {
            navigator.clipboard?.writeText(text) || (() => {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            })();
            return true;
        } catch (e) {
            alert('复制失败');
            return false;
        }
    }

    function showCopyToast(text) {
        let toast = document.getElementById('copyToast') || (() => {
            const t = document.createElement('div');
            t.id = 'copyToast';
            t.className = 'copy-toast';
            document.body.appendChild(t);
            return t;
        })();
        toast.textContent = text;
        toast.style.display = 'block';
        setTimeout(() => toast.style.display = 'none', 2000);
    }

    function getCombinedSpec(color, size) {
        const c = (color || '').trim(), s = (size || '').trim();
        return c && s ? `${c}-${s}` : c || s || '';
    }

    function getPrioritySpec(asin) {
        const specMap = asinSpecCache.get(asin) || {};
        for (const code of specPriority) {
            if (specMap[code]) return specMap[code];
        }
        return '无数据';
    }

    // ========== 保留zbig/MoreAboutAsin/v2/接口逻辑 ==========
    function sendBatchAsinDetailRequest(asins, code, token) {
        if (!token) {
            return Promise.reject(new Error('token为空，请先登录智赢选品'));
        }
        if (!asins || asins.length === 0) {
            return Promise.reject(new Error('ASIN列表为空'));
        }

        return new Promise((resolve, reject) => {
            const timestamp = Math.round(new Date().getTime() / 1000).toString();
            const requestData = JSON.stringify(asins.map(asin => ({ asin: asin })));
            const version = "v1";
            const postUrl = "https://amazon.zying.net";
            const method = "POST";
            const apiPath = `/api/zbig/MoreAboutAsin/v2/${code}`; // 核心zbig接口

            // 签名逻辑
            const signStr = requestData + method + apiPath + timestamp + token + version;
            const signature = CryptoJS.HmacSHA256(signStr, postUrl).toString(CryptoJS.enc.Hex);

            GM.xmlHttpRequest({
                method: 'POST',
                url: postUrl + apiPath,
                headers: {
                    'Content-Type': 'application/json',
                    'Token': token,
                    'Version': version,
                    'Signature': signature,
                    'Timestamp': timestamp,
                    'Cookie': document.cookie,
                    'ext_version': "5.0.47",
                    'client_identify': ""
                },
                data: requestData,
                onload: function(response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        resolve(data);
                    } catch (e) {
                        reject(new Error('zbig接口返回数据解析失败'));
                    }
                },
                onerror: function(error) {
                    reject(new Error(`zbig接口请求失败: ${error.status}`));
                },
                timeout: 10000,
                ontimeout: function() {
                    reject(new Error('zbig接口请求超时'));
                }
            });
        });
    }

    // 跟卖检测核心（基于zbig接口）
    function batchUpdateSellerMatch(asins, code, salesMap, token) {
        sendBatchAsinDetailRequest(asins, code, token)
            .then(detailData => {
                if (detailData.code === 200 && detailData.data) {
                    asins.forEach(asin => {
                        if (!asinRowMap.has(asin)) return;

                        let matchedPerson = null;
                        const offers = (detailData.data[asin] && detailData.data[asin].Offers) || [];

                        // 精准匹配跟卖名单
                        for (const offer of offers) {
                            const offerSellerId = (offer.SellerId || '').trim().toLowerCase();
                            if (sellerIdToPerson.has(offerSellerId)) {
                                matchedPerson = sellerIdToPerson.get(offerSellerId);
                                break;
                            }
                        }

                        // 颜色逻辑：已跟卖=绿色，未跟卖=红色
                        const { row } = asinRowMap.get(asin);
                        const site = amazonSites.find(item => item.code === code);
                        if (site) {
                            const cell = row.cells[site.colIndex];
                            const sales = salesMap[asin] || '无数据';
                            const colorClass = matchedPerson ? 'seller-green' : 'seller-red';
                            const tipText = matchedPerson ? `（${matchedPerson}）` : '（未跟卖）';

                            cell.innerHTML = `${sales}<span class="seller-match-tip ${colorClass}">${tipText}</span>`;
                            cell.title = sales;
                            if (sales === '请求失败' || sales === '请求超时') {
                                cell.style.color = '#ff4444';
                            }
                        }
                    });
                } else {
                    // zbig接口返回异常
                    asins.forEach(asin => {
                        if (!asinRowMap.has(asin)) return;
                        const { row } = asinRowMap.get(asin);
                        const site = amazonSites.find(item => item.code === code);
                        if (site) {
                            const cell = row.cells[site.colIndex];
                            const sales = salesMap[asin] || '无数据';
                            cell.innerHTML = `${sales}<span class="seller-match-tip seller-gray">（跟卖查询失败）</span>`;
                        }
                    });
                }
            })
            .catch(err => {
                // zbig接口请求失败
                console.error(`${code}站点zbig接口失败:`, err);
                asins.forEach(asin => {
                    if (!asinRowMap.has(asin)) return;
                    const { row } = asinRowMap.get(asin);
                    const site = amazonSites.find(item => item.code === code);
                    if (site) {
                        const cell = row.cells[site.colIndex];
                        const sales = salesMap[asin] || '无数据';
                        const errorTip = err.message.includes('token为空') ? '（未登录）' : '（跟卖查询失败）';
                        cell.innerHTML = `${sales}<span class="seller-match-tip seller-gray">${errorTip}</span>`;
                    }
                });
            });
    }

    // ASIN选择逻辑
    function toggleAsinSelect(asin, cell) {
        if (selectedAsins.has(asin)) {
            selectedAsins.delete(asin);
            cell.classList.remove('selected');
        } else {
            selectedAsins.add(asin);
            cell.classList.add('selected');
        }
    }

    // 初始化表格
    function initAsinTable(asins = []) {
        const tbody = document.getElementById('tableBody');
        tbody.innerHTML = '';
        asinRowMap.clear();
        asinSpecCache.clear();
        selectedAsins.clear();

        if (!asins.length) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 7;
            td.textContent = "输入ASIN后点击查询（自动剔除重复）...";
            tr.appendChild(td);
            tbody.appendChild(tr);
            return;
        }

        asins.forEach(asin => {
            asinSpecCache.set(asin, {});
            const tr = document.createElement('tr');

            // ASIN列
            const asinTd = document.createElement('td');
            asinTd.textContent = asin;
            asinTd.className = 'asin-cell';
            asinTd.onclick = (e) => {
                e.stopPropagation();
                toggleAsinSelect(asin, asinTd);
                copyTextToClipboard(asin) && showCopyToast(`【${asin}】复制成功`);
            };
            tr.appendChild(asinTd);

            // 规格列
            const sizeTd = document.createElement('td');
            sizeTd.textContent = '无数据';
            tr.appendChild(sizeTd);

            // 站点列（初始化加载中）
            amazonSites.forEach(() => {
                const td = document.createElement('td');
                td.textContent = '加载中...';
                tr.appendChild(td);
            });

            tbody.appendChild(tr);
            asinRowMap.set(asin, { row: tr });
        });
    }

    // 批次拆分
    function chunkArray(arr, size) {
        const chunks = [];
        for (let i = 0; i < arr.length; i += size) {
            chunks.push(arr.slice(i, i + size));
        }
        return chunks;
    }

    // 销量查询请求
    async function sendBatchSalesRequest(site, asins, token) {
        if (!token) {
            asins.forEach(asin => {
                const row = asinRowMap.get(asin)?.row;
                if (row) {
                    const cell = row.cells[site.colIndex];
                    cell.innerHTML = '未登录<span class="seller-match-tip seller-gray">（未查询）</span>';
                }
            });
            return;
        }

        // 销量接口签名
        const ts = Math.round(Date.now() / 1000).toString();
        const data = JSON.stringify({ abbr: site.code, pagesize: BATCH_SIZE, keys: asins });
        const signStr = data + 'POST' + '/api/CmdHandler?cmd=zscout_asin.list' + ts + token + 'v1';
        const sign = CryptoJS.HmacSHA256(signStr, 'https://amazon.zying.net').toString(CryptoJS.enc.Hex);

        return new Promise(resolve => {
            GM.xmlHttpRequest({
                method: 'POST',
                url: API_LIST_URL,
                headers: {
                    'Content-Type': 'application/json',
                    'Token': token,
                    'Version': 'v1',
                    'Signature': sign,
                    'Timestamp': ts,
                    'Cookie': document.cookie
                },
                data: data,
                onload: (res) => {
                    try {
                        const result = JSON.parse(res.responseText);
                        const salesMap = {};
                        asins.forEach(asin => salesMap[asin] = '无数据');

                        if (result.code === 200 && result.data?.list) {
                            result.data.list.forEach(item => {
                                salesMap[item.asin] = item.sales || '无数据';
                                // 更新规格缓存
                                const spec = getCombinedSpec(item.color, item.size);
                                const specMap = asinSpecCache.get(item.asin) || {};
                                specMap[site.code] = spec;
                                asinSpecCache.set(item.asin, specMap);
                                // 更新规格列
                                const row = asinRowMap.get(item.asin)?.row;
                                row && (row.cells[SIZE_COL_INDEX].textContent = getPrioritySpec(item.asin));
                            });
                        }

                        // 先更新销量，再调用zbig接口查跟卖
                        asins.forEach(asin => {
                            const row = asinRowMap.get(asin)?.row;
                            if (row) {
                                const cell = row.cells[site.colIndex];
                                cell.textContent = salesMap[asin]; // 先显示销量
                            }
                        });

                        // 调用zbig接口做跟卖检测（核心保留）
                        batchUpdateSellerMatch(asins, site.code, salesMap, token);
                    } catch (e) {
                        asins.forEach(asin => {
                            const row = asinRowMap.get(asin)?.row;
                            if (row) {
                                const cell = row.cells[site.colIndex];
                                cell.innerHTML = `请求失败<span class="seller-match-tip seller-gray">（解析失败）</span>`;
                            }
                        });
                    }
                    resolve();
                },
                onerror: () => {
                    asins.forEach(asin => {
                        const row = asinRowMap.get(asin)?.row;
                        if (row) {
                            const cell = row.cells[site.colIndex];
                            cell.innerHTML = `请求失败<span class="seller-match-tip seller-gray">（接口异常）</span>`;
                        }
                    });
                    resolve();
                },
                timeout: 10000,
                ontimeout: () => {
                    asins.forEach(asin => {
                        const row = asinRowMap.get(asin)?.row;
                        if (row) {
                            const cell = row.cells[site.colIndex];
                            cell.innerHTML = `请求超时<span class="seller-match-tip seller-gray">（超时）</span>`;
                        }
                    });
                    resolve();
                }
            });
        });
    }

    // 主查询逻辑
    async function processRequests(allAsins, token) {
        const batches = chunkArray(allAsins, BATCH_SIZE);
        const baseDelay = 200;

        for (const site of amazonSites) {
            for (let i = 0; i < batches.length; i++) {
                await new Promise(r => setTimeout(r, baseDelay));
                await sendBatchSalesRequest(site, batches[i], token);
            }
        }
    }

    // 查询入口（保留去重）
    function initQuery() {
        const token = GM_getValue("token", "");
        const input = document.getElementById('modalAsinInput').value.trim();

        if (!input) {
            alert("请输入ASIN！");
            return;
        }

        // 去重
        const rawAsins = input.split('\n').map(l => l.trim()).filter(l => l);
        const uniqueAsins = [...new Set(rawAsins)];

        // 去重提示
        if (rawAsins.length > uniqueAsins.length) {
           // alert(`已剔除${rawAsins.length - uniqueAsins.length}个重复ASIN，共查询${uniqueAsins.length}个`);
        }

        initAsinTable(uniqueAsins);
        processRequests(uniqueAsins, token);
    }

    // 渲染DOM
    function renderDOM() {
        // 底部按钮
        const btn = document.createElement('button');
        btn.id = 'asinQueryBtn';
        btn.textContent = 'ASIN销量查询(V3.2)';
        btn.onclick = () => {
            document.getElementById('asinQueryModalMask').style.display = 'block';
            document.getElementById('asinQueryModal').style.display = 'block';
        };
        document.body.appendChild(btn);

        // 遮罩层
        const mask = document.createElement('div');
        mask.id = 'asinQueryModalMask';
        mask.onclick = () => {
            mask.style.display = 'none';
            document.getElementById('asinQueryModal').style.display = 'none';
        };
        document.body.appendChild(mask);

        // 弹窗
        const modal = document.createElement('div');
        modal.id = 'asinQueryModal';
        modal.innerHTML = `
            <div id="modalCloseBtn" onclick="document.getElementById('asinQueryModalMask').style.display='none';this.parentElement.style.display='none'">×</div>
            <h3 style="text-align:center;">ASIN销量查询工具（V3.2）</h3>
            <div class="modal-form-group">
                <label>ASIN输入（一行一个）：</label>
                <textarea id="modalAsinInput" placeholder="B0C84J3HFR\nB08XXXXXXX"></textarea>
            </div>
            <div class="btn-group">
                <button id="modalQueryBtn">开始查询</button>
                <button id="modalClearBtn" onclick="document.getElementById('modalAsinInput').value='';initAsinTable()">清空</button>
                <button id="modalLoginBtn" onclick="window.open('${ZYING_LOGIN_URL}')">智赢登录</button>
            </div>
            <div class="modal-form-group">
                <label>查询结果：</label>
                <div class="table-container">
                    <table id="resultTable">
                        <thead>
                            <tr>
                                <th>ASIN（点击复制）</th>
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
            </div>
        `;
        document.body.appendChild(modal);

        // 绑定查询事件
        document.getElementById('modalQueryBtn').onclick = initQuery;

        // 初始化空表格
        initAsinTable();
    }

    // 页面加载完成后渲染
    window.addEventListener('load', renderDOM);

})();
