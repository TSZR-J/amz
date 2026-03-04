// ==UserScript==
// @name         一键调价插件
// @namespace    http://tampermonkey.net/
// @version      1.0.10
// @description  获取当前需调价的商品，支持手动选择校验国家
// @author       LHH
// @downloadURL  https://raw.githubusercontent.com/TSZR-J/amz/main/一键调价插件.user.js
// @updateURL    https://raw.githubusercontent.com/TSZR-J/amz/main/一键调价插件.user.js
// @match        *://*/*
// @grant         GM.xmlHttpRequest
// @connect amazon.zying.net
// @require      https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    //解析国家
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
    //判断是否智赢链接
    if(domain=='amazon.zying.net')
    {
        token = localStorage.getItem("token");
        GM_setValue("token", removeQuotes(token));
    }

    // 创建亚马逊站点数据数组（增强版，包含完整映射）
    const amazonSites = [
        {
            add: "https://www.amazon.it/dp/",
            name: "意大利",
            code: "IT"
        },
        {
            add: "https://www.amazon.fr/dp/",
            name: "法国",
            code: "FR"
        },
        {
            add: "https://www.amazon.co.uk/dp/",
            name: "英国",
            code: "GB"
        },
        {
            add: "https://www.amazon.de/dp/",
            name: "德国",
            code: "DE"
        },
        {
            add: "https://www.amazon.es/dp/",
            name: "西班牙",
            code: "ES"
        }
    ];

    // 新增：国家选择弹窗创建函数
    function createCountrySelectModal() {
        // 检查是否已存在弹窗，避免重复创建
        const existingModal = document.getElementById('country-select-modal');
        if (existingModal) {
            existingModal.style.display = 'block';
            return new Promise(resolve => {
                // 重新绑定确认按钮事件
                document.getElementById('confirm-country-btn').onclick = () => {
                    const selectedCode = document.getElementById('country-select').value;
                    const selectedSite = amazonSites.find(site => site.code === selectedCode);
                    resolve(selectedSite);
                    existingModal.style.display = 'none';
                };
                // 绑定关闭按钮事件
                document.getElementById('close-country-modal').onclick = () => {
                    resolve(null);
                    existingModal.style.display = 'none';
                };
            });
        }

        // 1. 创建遮罩层
        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'country-select-modal';
        modalOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.5);
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(2px);
        `;

        // 2. 创建弹窗容器
        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: white;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
            width: 350px;
            max-width: 90vw;
        `;

        // 3. 弹窗标题
        const modalTitle = document.createElement('h3');
        modalTitle.textContent = '选择校验国家';
        modalTitle.style.cssText = `
            margin: 0 0 20px 0;
            color: #333;
            font-size: 18px;
            text-align: center;
        `;

        // 4. 创建下拉选择框
        const selectContainer = document.createElement('div');
        selectContainer.style.cssText = `
            margin-bottom: 25px;
        `;

        const countrySelect = document.createElement('select');
        countrySelect.id = 'country-select';
        countrySelect.style.cssText = `
            width: 100%;
            padding: 12px 15px;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            font-size: 16px;
            color: #333;
            background: #f9f9f9;
            outline: none;
            transition: border-color 0.3s;
        `;
        countrySelect.onfocus = () => {
            countrySelect.borderColor = '#007bff';
        };

        // 填充下拉选项
        amazonSites.forEach(site => {
            const option = document.createElement('option');
            option.value = site.code;
            option.textContent = `${site.name} (${site.code})`;
            countrySelect.appendChild(option);
        });

        selectContainer.appendChild(countrySelect);

        // 5. 创建按钮组
        const buttonGroup = document.createElement('div');
        buttonGroup.style.cssText = `
            display: flex;
            gap: 10px;
            justify-content: center;
        `;

        // 确认按钮
        const confirmBtn = document.createElement('button');
        confirmBtn.id = 'confirm-country-btn';
        confirmBtn.textContent = '确认';
        confirmBtn.style.cssText = `
            padding: 10px 25px;
            background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            transition: transform 0.2s;
        `;
        confirmBtn.onmouseenter = () => {
            confirmBtn.style.transform = 'translateY(-2px)';
        };
        confirmBtn.onmouseleave = () => {
            confirmBtn.style.transform = 'translateY(0)';
        };

        // 关闭按钮
        const closeBtn = document.createElement('button');
        closeBtn.id = 'close-country-modal';
        closeBtn.textContent = '取消';
        closeBtn.style.cssText = `
            padding: 10px 25px;
            background: #f5f5f5;
            color: #666;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            transition: transform 0.2s;
        `;
        closeBtn.onmouseenter = () => {
            closeBtn.style.transform = 'translateY(-2px)';
        };
        closeBtn.onmouseleave = () => {
            closeBtn.style.transform = 'translateY(0)';
        };

        buttonGroup.appendChild(confirmBtn);
        buttonGroup.appendChild(closeBtn);

        // 组装弹窗
        modalContent.appendChild(modalTitle);
        modalContent.appendChild(selectContainer);
        modalContent.appendChild(buttonGroup);
        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);

        // 返回Promise，等待用户选择
        return new Promise(resolve => {
            // 确认按钮事件
            confirmBtn.onclick = () => {
                const selectedCode = countrySelect.value;
                const selectedSite = amazonSites.find(site => site.code === selectedCode);
                resolve(selectedSite);
                modalOverlay.style.display = 'none';
            };

            // 取消按钮事件
            closeBtn.onclick = () => {
                resolve(null);
                modalOverlay.style.display = 'none';
            };

            // 点击遮罩层关闭
            modalOverlay.onclick = (e) => {
                if (e.target === modalOverlay) {
                    resolve(null);
                    modalOverlay.style.display = 'none';
                }
            };

            // ESC键关闭
            document.addEventListener('keydown', function escHandler(e) {
                if (e.key === 'Escape') {
                    resolve(null);
                    modalOverlay.style.display = 'none';
                    document.removeEventListener('keydown', escHandler);
                }
            });
        });
    }

    // 新增：ASIN有效性校验函数（核心修复）
    function isValidASIN(text) {
        // 亚马逊ASIN规则：10位纯字母/数字，优先匹配B0开头（兼容所有合法ASIN）
        const asinRegex = /^[A-Z0-9]{10}$/;
        // 过滤包含SKU、换行、横杠、斜杠的无效文本
        const invalidPattern = /SKU|\n|-|\/|\\/i;

        // 校验条件：非空 + 符合10位格式 + 不含无效字符
        return text && asinRegex.test(text) && !invalidPattern.test(text);
    }

    // 新增：从文本中提取有效ASIN（处理混杂文本）
    function extractValidASINFromText(rawText) {
        if (!rawText) return null;
        // 匹配文本中所有10位字母/数字的片段，筛选有效ASIN
        const asinMatches = rawText.match(/[A-Z0-9]{10}/g) || [];
        return asinMatches.find(match => isValidASIN(match)) || null;
    }

    // 2. 核心功能实现（修改为接收手动选择的国家）
    async function init(selectedSite) {
        // 如果未选择国家，直接返回
        if (!selectedSite) {
            showNotification('未选择校验国家，操作已取消');
            return;
        }

        // 1. 获取所有带data-sku的div
        const skuDivs = document.querySelectorAll('div[data-sku]');
        if (skuDivs.length === 0) {
            console.log('❌ 未找到带有data-sku属性的div元素');
            showNotification('未找到带有SKU的商品元素');
            return;
        }

        const resultList = [];
        let skuMap = new Map();
        // 2. 遍历每个div，DOM解析ASIN
        skuDivs.forEach((skuDiv, index) => {
            const sku = skuDiv.getAttribute('data-sku');
            let asin = null;

            // -------- 方式1：匹配"ASIN"标签后的内容（优先） --------
            const asinLabelNodes = skuDiv.querySelectorAll('span, div');
            for (const node of asinLabelNodes) {
                if (node.innerText.trim() === 'ASIN') {
                    const asinValueNode = node.parentElement?.nextElementSibling;
                    if (asinValueNode) {
                        const rawText = asinValueNode.innerText.trim();
                        // 修复：从原始文本中提取有效ASIN
                        asin = extractValidASINFromText(rawText);
                        if (asin) break; // 找到有效ASIN则退出
                    }
                }
            }

            // -------- 方式2：备选 - 匹配亚马逊链接中的ASIN --------
            if (!asin) {
                const amazonLinks = skuDiv.querySelectorAll('a[href*="/dp/"]');
                if (amazonLinks.length > 0) {
                    const linkHref = amazonLinks[0].getAttribute('href');
                    const asinMatch = linkHref.match(/dp\/([A-Z0-9]{10})/);
                    if (asinMatch && isValidASIN(asinMatch[1])) {
                        asin = asinMatch[1];
                    }
                }
            }

            // 仅当ASIN有效时才加入映射和结果列表
            if (asin) {
                skuMap.set(asin, skuDiv); // 以主值为key，元素为value
                resultList.push(asin);
            }
        });

        // 检查是否提取到有效ASIN
        if (resultList.length === 0) {
            showNotification('未提取到有效ASIN，请检查商品信息');
            return;
        }

        // 直接使用手动选择的国家信息发送请求
        sendAsinRequest(selectedSite, skuMap, resultList);
        showNotification(`开始校验${selectedSite.name}(${selectedSite.code})的${resultList.length}个ASIN注册状态`);
    }

    // 3. 添加美观的蓝色ASIN标签
    function addAsinLabel(code,arr,element, asin,name,sales) {
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
        background-color: #FF0000;
        color: white;
        font-size: 12px;
        font-weight: bold;
        border-radius: 4px;
        vertical-align: middle;
        text-decoration: none;  // 添加此行去除下划线
    `;
        const existingLabel = element.querySelector(`a#${asin+code}inspectionRegistration`);
        if (existingLabel) existingLabel.remove();
        // 创建a标签并设置跳转链接
        const label = document.createElement('a');
        label.id = asin+code + 'inspectionRegistration'; // 设置唯一ID
        label.href = arr+asin;  // 跳转到百度搜索ASIN
        label.target = '_blank';  // 在新标签页打开
        if(sales==4)
        {
            label.style.cssText = labelStyle_r;
            label.textContent = ` ${name}已注册`;
        }
        else
        {
            label.style.cssText = labelStyle_g;
            label.textContent = ` ${name}未注册`;
        }

        // 在元素最前面插入标签
        if (element.firstChild) {
            element.insertBefore(label, element.firstChild);
        } else {
            element.appendChild(label);
        }
    }

    // 解析并提取 sales 字段的函数
    function getSalesData(data) {
        //console.log(" 解析结果:", data); // 输出: 28
        let brand_status =0;
        brand_status= data.brand_status;
        return brand_status;
    }

    // 发送API请求函数（并行分批，每批最多20个ASIN）
    function sendAsinRequest(amazonSites, skuMap, asins) {
        // 1. 定义每批最大请求数
        const BATCH_SIZE = 20;
        // 2. 将asins拆分为多个批次（每批≤20个）
        const asinBatches = [];
        for (let i = 0; i < asins.length; i += BATCH_SIZE) {
            asinBatches.push(asins.slice(i, i + BATCH_SIZE));
        }

        console.log(`📊 共拆分出 ${asinBatches.length} 批ASIN，每批最多${BATCH_SIZE}个`);

        // 3. 并行遍历每个批次发送请求
        asinBatches.forEach((batchAsins, batchIndex) => {
            console.log(`📤 发送第${batchIndex + 1}批请求，包含${batchAsins.length}个ASIN：`, batchAsins);

            // 获取token（每批请求重新获取最新token，避免过期）
            let token = GM_getValue("token", ""); // 统一变量大小写，修复原代码大小写混用问题
            const ts = Math.round(Date.now() / 1000) + '';
            const data = JSON.stringify(batchAsins.map(a => ({
                asin: a
            })));
            const v = "v1";
            const host = "https://amazon.zying.net";
            const path = `/api/zbig/MoreAboutAsin/v2/${amazonSites.code}`;

            // 生成签名（修复原代码token大小写问题）
            const signStr = data + "POST" + path + ts + token + v;
            const sign = CryptoJS.HmacSHA256(signStr, host).toString(CryptoJS.enc.Hex);

            // 发送GM XMLHttpRequest请求
            GM.xmlHttpRequest({
                method: "POST",
                url: host + path,
                data: data,
                headers: {
                    'Content-Type': 'application/json',
                    Token: token,
                    Version: v,
                    Signature: sign,
                    Timestamp: ts
                },
                onload: function(response) {
                    console.log(`✅ 第${batchIndex + 1}批请求响应状态：`, response.status);
                    let resData = {};

                    // 处理JSON解析异常
                    try {
                        resData = JSON.parse(response.responseText);
                    } catch (e) {
                        console.error(`❌ 第${batchIndex + 1}批响应JSON解析失败：`, e);
                        // 解析失败时给当前批次所有ASIN添加失效标签
                        batchAsins.forEach(asin => {
                            addAsinLabel("null", "https://amazon.zying.net/#/bigData", skuMap.get(asin), asin, '响应数据解析失败', 4);
                        });
                        return;
                    }

                    // 处理接口返回异常
                    if (resData.code !== 200 || !resData.data) {
                        console.warn(`⚠️ 第${batchIndex + 1}批请求返回异常：`, resData);
                        batchAsins.forEach(asin => {
                            addAsinLabel("null", "https://amazon.zying.net/#/bigData", skuMap.get(asin), asin, '智赢插件登录失效，请点击跳转重新登录', 4);
                        });
                        return;
                    }

                    // 正常处理当前批次的每个ASIN
                    // 新增：统计已注册的ASIN数量
                    let registeredCount = 0;
                    batchAsins.forEach(asin => {
                        const brand = (resData.data[asin] || {}).BrandSourceDetails || [];
                        const targetSource = amazonSites.code;
                        const targetStatus = '已注册';

                        const isRegistered = brand.some(b => {
                            return b?.Source === targetSource && b?.Status === targetStatus;
                        });

                        if (isRegistered) {
                            addAsinLabel(amazonSites.code, amazonSites.add, skuMap.get(asin), asin, amazonSites.name, 4);
                            registeredCount++; // 已注册数量+1
                        } else {
                            addAsinLabel(amazonSites.code, amazonSites.add, skuMap.get(asin), asin, amazonSites.name, 0);
                        }
                    });

                    // 新增：批次处理完成后，根据统计结果给出提示
                    if (registeredCount > 0) {
                        showNotification(`⚠️ 第${batchIndex + 1}批校验完成：找到${registeredCount}个${amazonSites.name}已注册商品，请仔细检查！`);
                    } else {
                        showNotification(`✅ 第${batchIndex + 1}批校验完成：未找到${amazonSites.name}已注册商品`);
                    }
                },
                onerror: function(error) {
                    console.error(`❌ 第${batchIndex + 1}批请求网络失败：`, error);
                    // 请求失败时，给当前批次所有ASIN添加失败提示
                    batchAsins.forEach(asin => {
                        console.error(`Request failed for ASIN ${asin}:`, error);
                        addAsinLabel("null", "https://amazon.zying.net/#/bigData", skuMap.get(asin), asin, '请求接口失败', 4);
                    });
                },
                onabort: function() {
                    console.warn(`⚠️ 第${batchIndex + 1}批请求被中止`);
                }
            });
        });

        console.log(`🚀 所有${asinBatches.length}批ASIN请求已全部发起（并行执行）`);
    }

    // 示例调用方式（直接调用即可，无需await）：
    // const amazonSites = { code: "GB", add: "https://www.amazon.co.uk/dp/", name: "英国(GB)" };
    // const skuMap = new Map([["B0DSJZ89HG", "B3-9U6X-XTCM"]]);
    // const asins = ["B0DSJZ89HG", "B0XXXXXXX1", ...]; // 可传入任意长度的ASIN数组
    // sendAsinRequest(amazonSites, skuMap, asins);

    let currentScrollIndex = 0;
    let isScrolling = false;

    function cycleScrollToRedCross() {
        if (isScrolling) return;

        const elements = document.querySelectorAll('.JanusReferencePrice-module__redCross--8YkaC');

        if (elements.length === 0) {
            showNotification("未找到需调价的商品");
            return;
        }

        // 如果当前索引超出范围，重置为0
        if (currentScrollIndex >= elements.length) {
            currentScrollIndex = 0;
        }

        const element = elements[currentScrollIndex];
        if (!element) return;

        // 清除之前的高亮
        elements.forEach(el => {
            el.style.boxShadow = '';
            el.style.transition = '';
        });

        const elementRect = element.getBoundingClientRect();
        const currentScrollY = window.pageYOffset || document.documentElement.scrollTop;

        // 计算目标滚动位置（元素垂直居中显示）
        const targetScrollY = elementRect.top + currentScrollY - (window.innerHeight / 2) + (elementRect.height / 2);

        // 执行平滑滚动动画
        isScrolling = true;
        const startTime = performance.now();
        const duration = 800;

        function animateScroll(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // 使用缓动函数使滚动更自然
            const easeOutCubic = 1 - Math.pow(1 - progress, 3);

            const newScrollY = currentScrollY + (targetScrollY - currentScrollY) * easeOutCubic;

            window.scrollTo(0, newScrollY);

            if (progress < 1) {
                requestAnimationFrame(animateScroll);
            } else {
                // 滚动完成后高亮当前元素
                element.style.boxShadow = '0 0 0 3px #007bff, 0 0 20px rgba(0, 123, 255, 0.3)';
                element.style.transition = 'box-shadow 0.3s ease';
                isScrolling = false;

                // 更新索引，准备下一次点击
                currentScrollIndex = (currentScrollIndex + 1) % elements.length;
            }
        }

        requestAnimationFrame(animateScroll);
    }
    /**
 * 元素循环滚动定位功能
 * 通过单个函数实现所有目标元素的循环定位
 */
    // 滚动到底部功能
    function scrollToBottom() {
        // 获取当前滚动位置和最大滚动距离
        const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
        const maxScroll = document.documentElement.scrollHeight - document.documentElement.clientHeight;

        // 检查是否已经到达底部
        if (currentScroll >= maxScroll - 10) { // 允许10px的误差
            showNotification('已到达页面最底部');
            return;
        }

        // 执行滚动动画
        const startTime = performance.now();
        const duration = 800; // 动画持续时间

        function animateScroll(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // 使用缓动函数使滚动更自然
            const easeOutQuart = 1 - Math.pow(1 - progress, 4);

            // 计算新的滚动位置
            const newScroll = currentScroll + (maxScroll - currentScroll) * easeOutQuart;

            window.scrollTo(0, newScroll);

            if (progress < 1) {
                requestAnimationFrame(animateScroll);
            }
        }

        requestAnimationFrame(animateScroll);
    }
    /**
 * 优雅的渐隐提示组件
 * 自动显示并隐藏，无需用户交互
 */
    function showNotification(message, duration = 3000) {
        // 创建通知元素
        const notification = document.createElement('div');

        // 设置样式
        notification.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) translateY(-20px);
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 15px 25px;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
        opacity: 0;
        transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        z-index: 9999;
        font-family: 'Segoe UI', system-ui, sans-serif;
        font-size: 14px;
        font-weight: 500;
        max-width: 300px;
        backdrop-filter: blur(10px);
        text-align: center;
    `;

        notification.textContent = message;
        document.body.appendChild(notification);

        // 显示动画
        setTimeout(() => {
            notification.style.transform = 'translate(-50%, -50%)';
            notification.style.opacity = '1';
        }, 10);

        // 自动隐藏
        setTimeout(() => {
            notification.style.transform = 'translate(-50%, -50%) translateY(-20px)';
            notification.style.opacity = '0';

            // 动画结束后移除元素
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 500);
        }, duration);
    }

    function autoAdjustPrice() {
        // 获取所有符合条件的表格单元格
        const tableCells = document.querySelectorAll('.TableCell-module__cellLayout--dcdTa.JanusTable-module__janusCell2--CqIZY');
        let i = 0;
        // 遍历每个单元格
        tableCells.forEach(cell => {
            // 检查元素是否在当前视口内可见
            const rect = cell.getBoundingClientRect();
            const isVisible = (
                rect.top >= 0 &&
                rect.left >= 0 &&
                rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                rect.right <= (window.innerWidth || document.documentElement.clientWidth)
            );

            if (!isVisible) {
                return; // 跳过不可见的单元格
            }

            // 检查是否包含红色叉号图标
            const redCross = cell.querySelector('.JanusReferencePrice-module__redCross--8YkaC');
            if (!redCross) {
                return; // 跳过不包含红色叉号的单元格
            }

            // 获取推荐报价金额
            const referenceTextElements = cell.querySelectorAll('.JanusRichText-module__defaultText--pMlk1');
            let referenceTotal = 0;

            referenceTextElements.forEach(element => {
                const text = element.textContent.trim();
                // 匹配金额格式 "£14.14 + £0.00"
                const priceMatch = text.match(/[\p{Sc}\$£€¥](\d+\.?\d*)\s*\+\s*[\p{Sc}\$£€¥](\d+\.?\d*)/u);
                if (priceMatch) {
                    const mainPrice = parseFloat(priceMatch[1]);
                    const shippingPrice = parseFloat(priceMatch[2]);
                    referenceTotal = mainPrice + shippingPrice;
                }
            });

            // 获取价格输入框
            const priceInputs = cell.querySelectorAll('kat-input-group');
            // 获取当前价格
            let currentPrice = parseFloat(priceInputs[0].childNodes[1].value)||0;
            // 获取最低价格
            let minPrice = parseFloat(priceInputs[1].childNodes[1].value) || 0;

            // 判断当前价格是否大于推荐报价
            if (currentPrice > referenceTotal) {
                let newPrice = (referenceTotal - 0.06)/0.95;

                // 检查新价格是否低于最低价格（仅当最低价格不为空时）
                if (minPrice !== null && newPrice < minPrice) {
                    newPrice = minPrice;
                }
                priceInputs[0].childNodes[1].value = newPrice.toFixed(2);

                // 触发输入事件以确保UI更新
                const inputEvent = new Event('input', { bubbles: true });
                priceInputs[0].childNodes[1].dispatchEvent(inputEvent);

                // 触发change事件
                const changeEvent = new Event('change', { bubbles: true });
                priceInputs[0].childNodes[1].dispatchEvent(changeEvent);
            }
            i=i+1;
        });
        if(i>0)
        {
            showNotification(`共调整${i}个商品的价格，请仔细检查后提交`);
        }
        else
        {
            showNotification(`未找到需要调价的商品`);
        }
    }

    function autoAdjustInventory() {
        // 获取所有符合条件的表格单元格
        const tableCells = document.querySelectorAll('.TableCell-module__cellLayout--dcdTa.JanusTable-module__janusCell2--CqIZY');
        let i = 0;

        // 遍历每个单元格
        tableCells.forEach(cell => {
            // 获取价格输入框数组（有多个元素，索引0/1/2分别对应不同价格项）
            const priceInputs = cell.querySelectorAll('kat-input-group');

            // 正确逻辑：priceInputs[1] = 最低价、priceInputs[2] = 最高价，childNodes只有1个（取[0]）
            let minPrice = parseFloat(priceInputs[1]?.childNodes[1]?.value) || NaN;
            let maxPrice = parseFloat(priceInputs[2]?.childNodes[1]?.value) || NaN;

            // 判断最低价和最高价都不为空（有效数字且大于0）
            const isMinMaxValid = !isNaN(minPrice) && minPrice > 0 && !isNaN(maxPrice) && maxPrice > 0;

            // 仅当最低价和最高价都有效时，执行库存调整
            if (isMinMaxValid) {
                // 找到相邻的指定div
                const adjacentDiv = cell.parentElement?.querySelectorAll('.TableCell-module__cellLayout--dcdTa.JanusTable-module__janusCell1--SdDkI');

                if (adjacentDiv[1]) {
                    const targetInputGroup = adjacentDiv[1].querySelector('kat-input-group');
                    const targetInput = targetInputGroup?.childNodes[0]; // 子节点仅1个，取[0]
                    if (targetInput) {
                        targetInput.value = 100; // 库存值赋值为100
                        const changeEvent = new Event('change', { bubbles: true });
                        targetInput.dispatchEvent(changeEvent); // 触发change事件
                        i++; // 仅成功调整时计数
                    }
                }
            }
        });

        // 库存调整提示语
        if (i > 0) {
            showNotification(`共调整${i}个商品的库存，请仔细检查后提交`);
        } else {
            showNotification(`未找到需要调整库存的商品（无有效最低价/最高价）`);
        }
    }

    // 导航
    // 检测URL并创建悬浮按钮
    function initInventoryAssistant() {
        // 检查当前URL是否包含目标路径
        const currentUrl = window.location.href;
        const targetPath = 'myinventory/inventory';

        if (currentUrl.includes(targetPath)) {
            createFloatingButtons();
            console.log('商品管理助手已启用 - 检测到目标页面');
            return true;
        }

        console.log('商品管理助手未启用 - 非目标页面');
        return false;
    }

    // 创建悬浮按钮组
    function createFloatingButtons() {
        // 创建主容器
        const buttonContainer = document.createElement('div');
        buttonContainer.id = 'inventory-assistant-panel';
        buttonContainer.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 9999;
        display: flex;
        gap: 12px;
        background: rgba(255, 255, 255, 0.95);
        padding: 12px 20px;
        border-radius: 10px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        transition: all 0.3s ease;
    `;

        // 按钮数据配置
        const buttonsConfig = [
            { id: 'locate-prev', text: '定位下一个需调价商品', onClick: handleLocatePrev },
            { id: 'auto-adjust', text: '自动调价', onClick: handleAutoAdjust },
            { id: 'inspection-registration', text: '校验本国注册', onClick: inspectionRegistration },
            { id: 'auto-adjust-inventory', text: '自动调库存', onClick: handleAutoAdjustInventory },
            { id: 'locate-next', text: '滚动到最底部↓↓↓', onClick: handleLocateNext }
        ];

        // 创建按钮
        buttonsConfig.forEach(config => {
            const button = document.createElement('button');
            button.id = config.id;
            button.textContent = config.text;
            button.style.cssText = `
            background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
            color: white;
            border: none;
            padding: 10px 16px;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.3s ease;
            box-shadow: 0 2px 8px rgba(0, 123, 255, 0.3);
            white-space: nowrap;
            min-width: 80px;
        `;

            // 悬停效果
            button.addEventListener('mouseenter', () => {
                button.style.transform = 'translateY(-2px)';
                button.style.boxShadow = '0 4px 12px rgba(0, 123, 255, 0.4)';
            });

            button.addEventListener('mouseleave', () => {
                button.style.transform = 'translateY(0)';
                button.style.boxShadow = '0 2px 8px rgba(0, 123, 255, 0.3)';
            });

            // 绑定点击事件
            button.addEventListener('click', config.onClick);

            buttonContainer.appendChild(button);

        });
        // 添加到页面
        document.body.appendChild(buttonContainer);

        // 添加滚动监听，保持按钮始终可见
        window.addEventListener('scroll', () => {
            buttonContainer.style.top = '20px';
        });
    }

    // 按钮点击事件处理函数
    function handleLocatePrev() {
        console.log('定位上一个功能已触发');
        cycleScrollToRedCross();
    }

    function handleAutoAdjust() {
        console.log('自动调价功能已触发');
        // 预留：添加自动调价逻辑
        autoAdjustPrice();
    }

    function handleAutoAdjustInventory() {
        console.log('自动调库存功能已触发');
        // 预留：添加自动调价逻辑
        autoAdjustInventory();
    }

    function handleLocateNext() {
        console.log('定位下一个功能已触发');
        scrollToBottom();
    }

    // 修改：校验注册函数改为异步，先弹出选择框
    async function inspectionRegistration() {
        console.log('校验是否注册已触发');
        // 弹出国家选择框，等待用户选择
        const selectedSite = await createCountrySelectModal();
        // 调用init函数并传入选择的国家
        init(selectedSite);
    }

    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initInventoryAssistant);
    } else {
        initInventoryAssistant();
    }

    // 导出函数供外部调用
    window.InventoryAssistant = {
        init: initInventoryAssistant,
        createButtons: createFloatingButtons,
        locatePrev: handleLocatePrev,
        autoAdjust: handleAutoAdjust,
        autoAdjustInventory: handleAutoAdjustInventory,
        locateNext: handleLocateNext
    };
})();
