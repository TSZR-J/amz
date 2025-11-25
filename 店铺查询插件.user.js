
// ==UserScript==
// @name         店铺查询插件
// @namespace    http://tampermonkey.net/
// @version      1.0.15
// @description  查询是否有跟卖店铺
// @author       LHH
// @downloadURL  https://raw.githubusercontent.com/TSZR-J/amz/main/店铺查询插件.user.js
// @updateURL    https://raw.githubusercontent.com/TSZR-J/amz/main/店铺查询插件.user.js
// @match        *://*/*
// @grant         GM.xmlHttpRequest
// @connect amazon.zying.net
// @require      https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';
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

    //解析asin码
    let asinStr = extractPatternString(window.location.href);
    function findChineseNames(inputStr) {
        const matches = [];

        names.forEach(item => {
            const [english, chinese] = item.split(';');
            if (inputStr.toLowerCase().includes(english.toLowerCase())) {
                matches.push(chinese);
            }
        });

        return matches.length > 0 ? `已被【${matches.toString()}】跟卖` : null;
    }
    //解析ASIN码
    function extractPatternString(inputStr) {
        // 匹配规则：10位字符，包含大写字母和数字
        const pattern = /([A-Z\d]{10})/;
        const match = inputStr.match(pattern);
        // 验证匹配结果是否符合完整规则
        if (match) {
            const matchedStr = match[0];
            // 检查是否同时包含字母和数字，且长度为10
            if (/[A-Z]/.test(matchedStr) &&
                /\d/.test(matchedStr) &&
                matchedStr.length === 10) {
                return matchedStr;
            }
        }
        return null;
    }
    //同步请求
    function syncXmlRequest(options) {
        const cookies = document.cookie;
        return new Promise((resolve, reject) => {
            GM.xmlHttpRequest({
                ...options,
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.5",
                    "Accept-Encoding": "gzip, deflate, br",
                    "Connection": "keep-alive",
                    "Cookie": cookies,
                    "DNT": "1",
                    "Upgrade-Insecure-Requests": "1",
                    "Sec-Fetch-Dest": "document",
                    "Sec-Fetch-Mode": "navigate",
                    "Sec-Fetch-Site": "same-origin",
                    "Sec-Fetch-User": "?1",
                    "Cache-Control": "max-age=0"
                },
                onload: (response) => {
                    if (response.status >= 200 && response.status < 300) {
                        resolve(response);
                    } else {
                        reject(new Error(`HTTP ${response.status}`));
                    }
                },
                onerror: (error) => reject(error)
            });
        });
    }
    //店铺集合
    const names = [
        "fzag12545;彭旭",
        "aoyinqiao;蔡眉眉",
        "baolinan;郁新林",
        "huayubusiness;王华宇",
        "pentastyt;彭雄",
        "ZhongXiangShiZhenShiPingShangMaoYouXianGongwe;李海鹏",
        "xiafaster-uk;夏银雪",
        "guangzhouhuiwushangmaoshanghang;杨栋奥",
        "suyingshangmao8888;彭水香",
        "zhanguanshangmao888;郭冬明",
        "hanhuananbune;韩花楠",
        "jiangzhengzhengvu8ne;蒋争争",
        "chenxikunbune;陈西堃",
        "niehongrongbune;聂洪荣",
        //"zhangwenjingbune;张文菁",
        "JiYuanShiChuanXiaoShuMaK;郝二德",
        "KaiFengJinHuiFuZhuangYouXianGongSi;陆书师",
        "chenxilanawdaw;陈锡岚",
        "yunnanhengchengjiaoyuzixunyouxiangongsi;白朝林",
        "wangruiawdaw;王锐",
        "fengxinfanchenhuanjingfuwuyouxiangongsi;左咸利",
        "panfeihedbgj;潘菲",
        "KaiFengJuNiuJiXieSheBeiZuLinYouXianGongSi;魏然",
        "jiangxisijiyouxicanyinyouxiangongsi;王新凤",
        "HuGuanXianGanShengJianZhuYouXianGongSi;李熙乾",
        "zhangzijunksdha;张子俊",
        "meiyongqiugdjsa;梅咏秋",
        "SHULEI0915;舒蕾",
        "HuangQianAHHA;黄黔",
        "chongyixianchangqingnongzijingxiaodian;刘常青",
        "HAOHAN888888;刘浩瀚"
    ];

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

    const API_URL = 'https://amazon.zying.net/api/CmdHandler?cmd=zscout_asin.list';

    // 2. 核心功能实现
    function sale() {
        // 获取所有role为listitem的div
        const listItems = document.querySelector('#productTitle.a-size-large.product-title-word-break');
        if (!listItems) {
            return;
        }

        // 使用for循环输出
        for (let i = 0; i < amazonSites.length; i++) {
            sendAsinRequest(amazonSites[i],listItems,asinStr);
        }
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
        label.href = arr+asin; // 跳转到百度搜索ASIN
        label.target = '_blank'; // 在新标签页打开
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
    function sendAsinRequest(amazonSites,item, asin) {
        //获取token
        let Token =GM_getValue("token", "");
        //获取时间戳
        let Timestamp = Math.round(new Date().getTime() / 1e3).toString();
        //获取data
        let data = JSON.stringify({
            abbr: amazonSites.code,
            pagesize: 100,
            keys: [asin]
        });
        //获取版本
        let Version = "v1";
        //获取url
        let post_url = "https://amazon.zying.net";
        //获取请求方法
        let post_method = "POST"
        //组装验签字符串
        let Signature = data+post_method+"/api/CmdHandler?cmd=zscout_asin.list"+Timestamp+Token+Version;
        //验签
        Signature = CryptoJS.HmacSHA256(Signature, post_url).toString(CryptoJS.enc.Hex);
        //

        GM.xmlHttpRequest({
            method: 'POST',
            url: 'https://amazon.zying.net/api/CmdHandler?cmd=zscout_asin.list',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': document.cookie,
                'Token':Token,
                'Version':Version,
                'Signature':Signature,
                'Timestamp':Timestamp
            },
            data: data,
            onload: function(response) {
                //console.log(`API  response for ASIN ${asin}:`, response.responseText);
                let data = JSON.parse(response.responseText);
                if(data.code === 401)
                {
                    addAsinLabel("https://amazon.zying.net/#/bigData",item, asin,'智赢插件登录失效，请跳转重新登录',0);
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
    // 目标元素ID
    const TARGET_ID = 'productTitle';
    // 按钮配置
    const BUTTON_CONFIG_A = {
        text: '未被自家店铺跟卖',
        styles: {
            background: 'linear-gradient(135deg, #34c759, #00b894)',
            color: 'white',
            padding: '8px 16px',
            border: 'none',
            borderRadius: '20px',
            fontSize: '14px',
            fontWeight: '600',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            cursor: 'pointer',
            marginBottom: '10px',
            transition: 'all 0.3s ease'
        },
        hoverStyles: {
            transform: 'translateY(-2px)',
            boxShadow: '0 6px 12px rgba(0,0,0,0.15)'
        }
    };
    // 按钮配置
    const BUTTON_CONFIG_B = {
        text: '单个卖家，注意检查',
        styles: {
            background: 'linear-gradient(135deg, #ffcc00, #ff7f50)',
            color: 'white',
            padding: '8px 16px',
            border: 'none',
            borderRadius: '20px',
            fontSize: '14px',
            fontWeight: '600',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            cursor: 'pointer',
            marginBottom: '10px',
            transition: 'all 0.3s ease'
        },
        hoverStyles: {
            transform: 'translateY(-2px)',
            boxShadow: '0 6px 12px rgba(0,0,0,0.15)'
        }
    };

    // 按钮配置
    const BUTTON_CONFIG_C = {
        text: '',
        styles: {
            background: 'linear-gradient(135deg, #ff4d4d, #ff6b6b)',
            color: 'white',
            padding: '8px 16px',
            border: 'none',
            borderRadius: '20px',
            fontSize: '14px',
            fontWeight: '600',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            cursor: 'pointer',
            marginBottom: '10px',
            transition: 'all 0.3s ease'
        },
        hoverStyles: {
            transform: 'translateY(-2px)',
            boxShadow: '0 6px 12px rgba(0,0,0,0.15)'
        }
    };

    // 创建按钮元素
    function createButton(style) {
        const btn = document.createElement('button');
        btn.textContent = style.text;
        // 应用基础样式
        Object.assign(btn.style, style.styles);
        // 添加悬停效果
        btn.addEventListener('mouseenter', () => {
            Object.assign(btn.style, style.hoverStyles);
        });
        btn.addEventListener('mouseleave', () => {
            Object.assign(btn.style, style.styles);
        });
        return btn;
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 主执行函数
    function injectButton(style) {
        const targetElement = document.querySelector('#productTitle.a-size-large.product-title-word-break');
        //检查是否已存在注入按钮
        if (targetElement.previousElementSibling &&
            targetElement.previousElementSibling.classList.contains('injected-btn')) {
            return;
        }
        const btn = createButton(style);
        btn.className = 'injected-btn';
        targetElement.parentNode.insertBefore(btn, targetElement);
    }

    //     // 使用MutationObserver监听DOM变化
    //     const observer = new MutationObserver(function(mutations) {
    //         mutations.forEach(function(mutation) {
    //             if (!document.getElementById(TARGET_ID)) return;
    //             const targetElement = document.getElementById(TARGET_ID);
    //             //检查是否已存在注入按钮
    //             if (targetElement.previousElementSibling &&
    //                 targetElement.previousElementSibling.classList.contains('injected-btn')) {
    //                 return;
    //             }
    //             main();
    //         });
    //     });

    // 开始观察
    //     observer.observe(document.body, {
    //         childList: true,
    //         subtree: true
    //     });
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
        if (target.tagName === 'INPUT' || target.tagName === 'BUTTON') {
            asin = target.closest('li').getAttribute('data-asin');
            console.log('Selected ASIN:', asin); // 输出: B0DL5VZMV3
            if(asin)
            {
                asinStr = asin;
                main();
                return;
            }
            asin = target.closest('li').getAttribute('data-csa-c-item-id');
            console.log('Selected ASIN:', asin); // 输出: B0DL5VZMV3
            if(asin)
            {
                asinStr = asin;
                main();
                return;
            }}

        // 特殊元素处理
        if (target.tagName === 'A') {
            asin = extractPatternString(target.getAttribute('data-value'));
            console.log('Selected ASIN:', asin); // 输出: B0DL5VZMV3
            if(asin)
            {
                asinStr = asin;
                main();
                return;
            }
        }


    });

    async function main() {
        console.log('开始执行');
        await sleep(3500); // 延迟1秒
        console.log('1秒后执行');
        console.log(window.location.href);
        console.log('获取到的ASIN为:', asinStr);
        if(!asinStr)
        {
            console.log('获取到的ASIN为空');
            return;
        }
        (async function() {
            try {
                //判断是否当前卖家是自家店铺
                const element = document.getElementById('sellerProfileTriggerId');
                if (element) {
                    const textContent = element.textContent;
                    let name = findChineseNames(textContent);
                    if(name)
                    {
                        BUTTON_CONFIG_C.text = name;
                        // 初始执行
                        injectButton(BUTTON_CONFIG_C);
                        return;
                    }
                }
                console.info(`https://${domain}/gp/product/ajax/aodAjaxMain/ref=aod_page_1?asin=${asinStr}&pc=dp&isonlyrenderofferlist=true&pageno=1`);
                const response = await syncXmlRequest({
                    method: "GET",
                    url: `https://${domain}/gp/product/ajax/aodAjaxMain/ref=aod_page_1?asin=${asinStr}&pc=dp&isonlyrenderofferlist=true&pageno=1`
                });
                const parser = new DOMParser();
                const doc = parser.parseFromString(response.responseText, "text/html");
                //获取其他卖家数量
                const inputElement = doc.getElementById('aod-total-offer-count');
                if (inputElement) {
                    const value = inputElement.value;
                    console.log('获取到的卖家数为:', value);
                    if(value&&value==0)
                    {
                        injectButton(BUTTON_CONFIG_A);
                        return;
                    }
                    // 计算循环次数（向上取整）
                    const loopCount = Math.ceil(value / 10);
                    const ariaLabels = [];
                    const promises = Array(loopCount).fill('').map(async (_, index) => {
                        const targetUrl = `https://${domain}/gp/product/ajax/aodAjaxMain/ref=aod_page_${index}?asin=${asinStr}&pc=dp&isonlyrenderofferlist=true&pageno=${index}`;
                        console.info(targetUrl);
                        const response = await syncXmlRequest({
                            method: "GET",
                            url: targetUrl
                        });

                        const parser = new DOMParser();
                        const doc = parser.parseFromString(response.responseText, "text/html");

                        doc.querySelectorAll('a.a-size-small.a-link-normal').forEach(link => {
                            const label = link.getAttribute('aria-label');
                            ariaLabels.push(label);
                        });
                    });
                    await Promise.all(promises);
                    // console.log('提取结果:',ariaLabels); // 显示内容
                    //console.log('提取结果长度:', ariaLabels.length);
                    let name = findChineseNames(ariaLabels.toString());
                    //判断是否被自家店铺跟卖
                    if(name)
                    {
                        BUTTON_CONFIG_C.text = name;
                        // 初始执行
                        injectButton(BUTTON_CONFIG_C);
                        return;
                    }
                    //调用接口判断是否自家店铺
                    const url = `https://${domain}/gp/product/ajax/aodAjaxMain/ref=dp_aod_NEW_mbc?asin=${asinStr}&m=&qid=&smid=&sourcecustomerorglistid=&sourcecustomerorglistitemid=&sr=&pc=dp`;
                    console.info(url);
                    const response = await syncXmlRequest({
                        method: "GET",
                        url: url
                    });
                    const label = parser.parseFromString(response.responseText, "text/html").querySelector('#a-autoid-2-sticky-pinned-offer input').getAttribute('aria-label') || '';
                    if (label) {
                        name = findChineseNames(label);
                        if(name)
                        {
                            BUTTON_CONFIG_C.text = name;
                            // 初始执行
                            injectButton(BUTTON_CONFIG_C);
                            return;
                        }
                    }
                    if(ariaLabels.length==0)
                    {
                        injectButton(BUTTON_CONFIG_B);
                        return;
                    }
                    injectButton(BUTTON_CONFIG_A);
                } else {
                    //alert('只有一个卖家或者卖家查询失败，请人工辨别是否自家店铺');
                    // 初始执行
                    injectButton(BUTTON_CONFIG_B);
                }
            } catch (error) {
                console.error('请求处理失败:', error);
            }
        })();
        //获取当前asin各国销量
        sale();
    }
    main();
})();
