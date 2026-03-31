// ==UserScript==
// @name         欧代处理插件
// @namespace    http://tampermonkey.net/
// @version      1.8
// @description  自动循环处理商品政策页面的提交→选择指定地址（无则选第一个）→保存→关闭流程
// @downloadURL  https://raw.githubusercontent.com/TSZR-J/amz/main/欧代处理插件.user.js
// @updateURL    https://raw.githubusercontent.com/TSZR-J/amz/main/欧代处理插件.user.js
// @author       You
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // 全局控制：允许停止脚本
    let isStop = false;

    // 1. 工具函数：等待指定毫秒数
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // 2. 工具函数1：等待元素出现（用于保存/关闭/默认地址按钮，仅按属性匹配）
    const waitForElement = async (selector, timeout = 10000) => {
        let startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            if(isStop) throw new Error("脚本已停止");
            const element = document.querySelector(selector);
            if (element) return element;
            await sleep(100);
        }
        throw new Error(`超时未找到元素：${selector}`);
    };

    // 3. 工具函数2：等待并查找包含指定文本的元素（用于优先匹配目标地址）
    const waitForElementWithText = async (selector, text, timeout = 1000) => {
        let startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            if(isStop) throw new Error("脚本已停止");
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
                if (el.textContent.includes(text)) {
                    return el;
                }
            }
            await sleep(100);
        }
        throw new Error(`未找到包含文本「${text}」的元素：${selector}`);
    };

    // 4. 核心处理函数：逐个处理提交按钮
    const processAllButtons = async () => {
        isStop = false;
        // 目标公司名称（优先匹配地址）
        const targetCompanyName = "TULIPWAYS CO LTD";
        // 需要匹配的GPSR文本
        const targetGPSRText = "GPSR： 负责人详细联系信息";

        // 获取所有政策行（包含普通行 + 嵌套行）
        const policyRows = document.querySelectorAll('.ahd-product-policy-table-row-wrapper, .ahd-product-policy-table-row-wrapper-nested');
        if (policyRows.length === 0) {
            alert('未找到任何商品政策条目！');
            return;
        }

        // 筛选：只保留 包含GPSR指定文本 + 按钮是【提交】的行
        const validRows = Array.from(policyRows).filter(row => {
            // 检查是否包含目标GPSR文本
            const hasGPSR = row.textContent.includes(targetGPSRText);
            if (!hasGPSR) return false;

            // 检查按钮是否是【提交】
            const btn = row.querySelector('kat-button[data-testid^="ahd-action-button-"]');
            if (!btn) return false;
            const btnLabel = btn.getAttribute('label') || '';
            return btnLabel.trim() === '提交';
        });

        if (validRows.length === 0) {
            alert('未找到符合条件的条目：需同时满足「GPSR：负责人详细联系信息」+「提交」按钮！');
            return;
        }

        console.log(`共找到 ${validRows.length} 个符合条件的GPSR提交条目`);

        // 循环处理符合条件的条目
        for (let i = 0; i < validRows.length; i++) {
            if(isStop) {
                console.log("用户手动停止脚本");
                alert("脚本已停止！");
                break;
            }

            try {
                console.log(`正在处理第 ${i+1}/${validRows.length} 个符合条件的条目`);
                const row = validRows[i];
                // 获取当前行的提交按钮
                const submitBtn = row.querySelector('kat-button[data-testid^="ahd-action-button-"]');

                // 步骤1：点击提交按钮
                submitBtn.click();
                console.log('已点击提交按钮，等待地址弹窗出现...');

                // 步骤2：等待3秒 + 优先找目标地址，无则选第一个
                await sleep(3000);
                let addressElement;
                try {
                    // 优先查找包含目标公司名称的地址
                    addressElement = await waitForElementWithText(
                        'div[data-testid="registry"]',
                        targetCompanyName
                    );
                    console.log(`找到目标地址「${targetCompanyName}」`);
                } catch (err) {
                    // 未找到目标地址，选第一个地址元素
                    console.log(`未找到「${targetCompanyName}」，选择第一个地址`);
                    addressElement = await waitForElement('div[data-testid="registry"]');
                }

                // 步骤3：点击地址元素
                addressElement.click();
                console.log('已点击地址元素，等待保存按钮...');
                await sleep(500);

                // 步骤4：点击保存按钮
                const saveButton = await waitForElement('kat-button[data-testid="primary-button"][label="保存"]');
                saveButton.click();
                console.log('已点击保存按钮，等待关闭按钮...');
                await sleep(2000);

                // 步骤5：点击关闭按钮
                const closeButton = await waitForElement('kat-button[label="关闭"][variant="primary"]');
                closeButton.click();
                console.log(`第 ${i+1} 个条目处理完成！`);

                // 处理下一个前稍等，避免页面卡顿
                await sleep(1000);
            } catch (error) {
                if(isStop) break;
                console.error(`处理第 ${i+1} 个条目时出错：`, error);
                try {
                    const closeButton = await waitForElement('span[aria-hidden="true"]');
                    closeButton.click();
                }catch(e){}
                await sleep(1000);
            }
        }

        if(!isStop) alert(`处理完成！共处理 ${validRows.length} 个GPSR提交条目`);
    };

    // 5. 添加操作按钮到页面
    const addControlButton = () => {
        // 只有存在 sptErrorBoundary 才显示按钮
        if(!document.querySelector('[data-testid="sptErrorBoundary"]')) return;

        // 容器：左侧垂直居中
        const container = document.createElement('div');
        container.style.cssText = `
            position: fixed;
            left: 10px;
            top: 50%;
            transform: translateY(-50%);
            z-index: 999999;
            display: flex;
            flex-direction: column;
            gap: 8px;
        `;

        // 开始按钮
        const startBtn = document.createElement('button');
        startBtn.textContent = '开始处理';
        startBtn.style.cssText = `
            padding: 6px 12px;
            background: #0099ff;
            color: white;
            border: none;
            border-radius: 4px;
            font-size: 14px;
            cursor: pointer;
            white-space: nowrap;
        `;

        // 取消按钮
        const stopBtn = document.createElement('button');
        stopBtn.textContent = '停止运行';
        stopBtn.style.cssText = `
            padding: 6px 12px;
            background: #ff4757;
            color: white;
            border: none;
            border-radius: 4px;
            font-size: 14px;
            cursor: pointer;
            white-space: nowrap;
        `;

        // 开始事件
        startBtn.addEventListener('click', async () => {
            startBtn.disabled = true;
            startBtn.textContent = '处理中...';
            await processAllButtons();
            startBtn.disabled = false;
            startBtn.textContent = '开始处理';
        });

        // 停止事件
        stopBtn.addEventListener('click', () => {
            isStop = true;
            startBtn.disabled = false;
            startBtn.textContent = '开始处理';
        });

        container.appendChild(startBtn);
        container.appendChild(stopBtn);
        document.body.appendChild(container);
    };

    // 页面加载完成后初始化
    window.addEventListener('load', addControlButton);
})();
