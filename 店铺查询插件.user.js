
// ==UserScript==
// @name         店铺查询插件
// @namespace    http://tampermonkey.net/
// @version      1.0.3
// @description  查询是否有跟卖店铺
// @author       LHH
// @downloadURL  https://raw.githubusercontent.com/TSZR-J/amz/main/店铺查询插件.user.js
// @updateURL    https://raw.githubusercontent.com/TSZR-J/amz/main/店铺查询插件.user.js
// @match        *://*/*
// @grant         GM.xmlHttpRequest
// ==/UserScript==

(function() {
    'use strict';
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
        "zhongxiangshizhenshiping;李海鹏",
        "xiafaster-uk;夏银雪",
        "guangzhouhuiwushangmaoshanghang;杨栋奥",
        "suyingshangmao8888;彭水香",
        "zhanguanshangmao888;郭冬明",
        "hanhuananbune;韩花楠",
        "jiangzhengzhengvu8ne;蒋争争",
        "chenxikunbune;陈西堃",
        "niehongrongbune;聂洪荣",
        "zhangwenjingbune;张文菁",
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
        "chongyixianchangqingnongzijingxiaodian;刘常青"
    ];
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

    // 主执行函数
    function injectButton(style) {
        const targetElement = document.getElementById(TARGET_ID);
        //检查是否已存在注入按钮
        if (targetElement.previousElementSibling &&
            targetElement.previousElementSibling.classList.contains('injected-btn')) {
            return;
        }
        const btn = createButton(style);
        btn.className = 'injected-btn';
        targetElement.parentNode.insertBefore(btn, targetElement);
    }

    // 使用MutationObserver监听DOM变化
    //     const observer = new MutationObserver(function(mutations) {
    //         mutations.forEach(function(mutation) {
    //             if (!document.getElementById(TARGET_ID)) return;
    //             injectButton();
    //         });
    //     });

    // 开始观察
    //     observer.observe(document.body, {
    //         childList: true,
    //         subtree: true
    //     });
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function main() {
        console.log('开始执行');
        await sleep(1000); // 延迟1秒
        console.log('1秒后执行');
        console.log(window.location.href);
        //解析国家
        const domain = new URL(window.location.href).hostname
        //解析asin码
        let asinStr = extractPatternString(window.location.href);
        console.log('获取到的ASIN为:', asinStr);
        if(!asinStr)
        {
            console.log('获取到的ASIN为空');
            return;
        }
        (async function() {
            try {
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
                    //判断是否当前卖家是自家店铺
                    const element = document.getElementById('sellerProfileTriggerId');
                    if (element) {
                        const textContent = element.textContent;
                        name = findChineseNames(textContent);
                        if(name)
                        {
                            BUTTON_CONFIG_C.text = name;
                            // 初始执行
                            injectButton(BUTTON_CONFIG_C);
                            return;
                        }
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
    }
    main();

})();
