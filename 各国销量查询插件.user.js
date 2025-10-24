// ==UserScript==
// @name         各国销量查询插件
// @namespace    http://tampermonkey.net/
// @version      1.0.2
// @description  查询是否有跟卖店铺
// @author       LHH
// @downloadURL  https://raw.githubusercontent.com/TSZR-J/amz/main/各国销量查询插件.user.js
// @updateURL    https://raw.githubusercontent.com/TSZR-J/amz/main/各国销量查询插件.user.js
// @match        *://*/*
// @grant         GM.xmlHttpRequest
// @connect amazon.zying.net
// ==/UserScript==

(function() {
    'use strict';
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
        let asin=null;
        if (target.classList.value === 's-pagination-item s-pagination-previous s-pagination-button s-pagination-button-accessibility s-pagination-separator') {
           console.log("上一页");
            setTimeout(init, 1500);
        }
        if (target.classList.value === 's-pagination-item s-pagination-next s-pagination-button s-pagination-button-accessibility s-pagination-separator') {
           console.log("下一页");
            setTimeout(init, 1500);
        }
        if (target.classList.value === 's-pagination-item s-pagination-button s-pagination-button-accessibility') {
           console.log("数字");
            setTimeout(init, 1500);
        }
        if(target.classList.value ==='a-dropdown-link')
        {
             console.log("下拉框");
          setTimeout(init, 1500);
        }
       if(target.classList.value ==='a-dropdown-link a-active')
        {
          console.log("下拉框");
          setTimeout(init, 1500);
        }
    });
    // 创建亚马逊站点数据数组
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
        // 1. 配置区域 - 请根据实际页面调整选择器
    const TARGET_DIV_SELECTOR = 'div#target-container'; // 指定div的选择器
    const API_URL = 'https://amazon.zying.net/api/CmdHandler?cmd=zscout_asin.list';

    // 2. 核心功能实现
    function init() {

        // 获取所有role为listitem的div
        const listItems = document.querySelectorAll('div[role="listitem"]');
        if (listItems.length  === 0) {
            console.warn(' 未找到任何listitem元素');
            return;
        }

        // 获取最大data-index确定循环次数
        const indexes = Array.from(listItems).map(item  => {
            const index = item.dataset.index;
            return index ? parseInt(index, 10) : -1;
        });
        const maxIndex = Math.max(...indexes);
        console.log(` 检测到最大索引: ${maxIndex}，共${listItems.length} 个项目`);

        // 处理每个listitem
        listItems.forEach((item,  index) => {
            const asin = item.dataset.asin;
            if (!asin) {
                console.warn(` 第${index+1}个listitem缺少data-asin属性`);
                return;
            }
// 使用for循环输出
for (let i = 0; i < amazonSites.length; i++) {
    sendAsinRequest(amazonSites[i],item,asin);
}

        });
    }

    // 3. 添加美观的蓝色ASIN标签
    function addAsinLabel(arr,element, asin,name,sales) {
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
    label.href = arr+asin;  // 跳转到百度搜索ASIN
    label.target = '_blank';  // 在新标签页打开
    if(sales>0)
    {
        label.style.cssText = labelStyle_g;
    }
        else
        {
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

    // 解析并提取 sales 字段的函数
function getSalesData(data) {
    //console.log(" 解析结果:", data); // 输出: 28
      let sales =0;
    if(data.data.list.length>0)
    {
       sales = data.data.list[0].sales;
       //console.log(" 解析结果:", sales); // 输出: 28
    }

  return sales;
}

        // 发送API请求函数
    function sendAsinRequest(amazonSites,item, asin) {
        GM.xmlHttpRequest({
            method: 'POST',
            url: 'https://amazon.zying.net/api/CmdHandler?cmd=zscout_asin.list',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': document.cookie
            },
            data: JSON.stringify({
                abbr: amazonSites.code,
                pagesize: 100,
                keys: [asin]
            }),
            onload: function(response) {
                //console.log(`API  response for ASIN ${asin}:`, response.responseText);
                let data = JSON.parse(response.responseText);
                if(data.code === 401)
                {
                    addAsinLabel("_blank",item, asin,'智赢插件登录失效，请退出重新登录',0);
                    return;
                }
                // 执行解析并打印结果
                const salesValue = getSalesData(data);
               // console.log(`销量:`, salesValue);
                            // 添加蓝色ASIN标签
                addAsinLabel(amazonSites.add,item, asin,amazonSites.name,salesValue);
            },
            onerror: function(error) {
                console.error(`Request  failed for ASIN ${asin}:`, error);
            }
        });
    }
    // 5. 页面加载完成后执行
    window.addEventListener('load', init);
})();
