const API_BASE = "https://solana-pay-gateway.nodecore.workers.dev";
const urlParams = new URLSearchParams(window.location.search);

const dataToken = urlParams.get('data');
const payParam = urlParams.get('pay');

let currentOrderId = "";
let globalAmount = "";
let currentProject = "";
let currentCacheKey = ""; 
let currentStorage = localStorage; 
let pollTimer = null;
let toastTimer = null;
let lastRenderedOrderInfo = null;

document.getElementById('current-year').innerText = new Date().getFullYear();

function showToast(text) {
    const tEl = document.getElementById('toast');
    document.getElementById('toast-msg').innerText = text;
    tEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => tEl.classList.remove('show'), 2500);
}

function copyAmount() {
    if (!globalAmount || globalAmount === "--.--") return;
    navigator.clipboard.writeText(globalAmount).then(() => {
        showToast(t("toast_amount_copied") + globalAmount);
    });
}

function copyAddress() {
    const addr = document.getElementById('target-address').innerText;
    if (!addr || addr.includes("...") || addr.includes("加载") || addr.includes("Loading")) return;
    navigator.clipboard.writeText(addr).then(() => {
        showToast(t("toast_addr_copied"));
    });
}

function copyTxHash() {
    const hash = document.getElementById('res-tx-hash').innerText;
    if (!hash || hash === "--" || hash.includes("暂无") || hash.includes("None")) return;
    navigator.clipboard.writeText(hash).then(() => {
        showToast(t("toast_hash_copied"));
    });
}

function copyDeliveryResult() {
    const txt = document.getElementById('res-url-text').innerText;
    if (!txt || txt === "--") return;
    navigator.clipboard.writeText(txt).then(() => {
        showToast(t("toast_delivery_copied"));
    });
}

function formatDateTime(rawTime) {
    if (!rawTime) return "--";
    const date = new Date(rawTime);
    if (isNaN(date.getTime())) return rawTime;

    const pad = (n) => String(n).padStart(2, '0');
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const hh = pad(date.getHours());
    const mm = pad(date.getMinutes());
    const ss = pad(date.getSeconds());

    return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

function openOrderModal(orderInfo) {
    lastRenderedOrderInfo = orderInfo;

    const badge = document.getElementById('res-status-badge');
    badge.innerText = orderInfo.status || "PAID";

    const displayProject = localizeProjectName(orderInfo.project || currentProject);
    document.getElementById('res-project').innerText = displayProject;
    document.getElementById('res-order-id').innerText = orderInfo.order_id || "--";
    document.getElementById('res-tx-hash').innerText = orderInfo.signature || t("default_tx_hash");

    const displayPrice = orderInfo.price || globalAmount || "--";
    document.getElementById('res-amount').innerText = `${displayPrice} ${orderInfo.token || "USDT"}`;

    document.getElementById('res-time').innerText = formatDateTime(orderInfo.paid_at || orderInfo.created_at);

    const urlRow = document.getElementById('res-row-url');
    const urlText = document.getElementById('res-url-text');

    if (orderInfo.url) {
        urlText.innerText = orderInfo.url;
        urlRow.classList.remove('hidden');
    } else {
        urlRow.classList.add('hidden');
    }

    document.getElementById('order-result-modal').classList.add('active');
    showToast(t("toast_modal_opened"));
}

function closeOrderModal() {
    document.getElementById('order-result-modal').classList.remove('active');
}

function copyAllOrderDetails() {
    if (!lastRenderedOrderInfo) return;
    const o = lastRenderedOrderInfo;
    const displayPrice = o.price || globalAmount || "";
    const displayProject = localizeProjectName(o.project || currentProject);
    const copyContent = 
`==========================
${t("copy_header_project")}${displayProject}
${t("copy_header_order_id")}${o.order_id || ""}
${t("copy_header_status")}${o.status || ""}
${t("copy_header_hash")}${o.signature || t("copy_header_none")}
${t("copy_header_amount")}${displayPrice} ${o.token || "USDT"}
${t("copy_header_time")}${formatDateTime(o.paid_at || o.created_at)}
${o.url ? t("copy_header_delivery") + o.url : ""}
==========================`;

    navigator.clipboard.writeText(copyContent.trim()).then(() => {
        showToast(t("toast_all_copied"));
    }).catch(() => {
        showToast(t("toast_copy_failed"));
    });
}

function handleOrderExpiredAndRecreate() {
    if (pollTimer) clearInterval(pollTimer);
    if (currentCacheKey && currentStorage) {
        currentStorage.removeItem(currentCacheKey);
    }
    
    if (dataToken) {
        fetchOrder(`${API_BASE}/?data=${encodeURIComponent(dataToken)}`, true, currentCacheKey);
    } else if (payParam && !isNaN(parseFloat(payParam)) && parseFloat(payParam) > 0) {
        const amountVal = parseFloat(payParam);
        fetchOrder(`${API_BASE}/?price=${encodeURIComponent(amountVal)}`, false, currentCacheKey);
    }
}

function startPolling(orderId) {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
        try {
            const res = await fetch(`${API_BASE}/check-status?order_id=${encodeURIComponent(orderId)}`);
            
            if (res.status === 404) {
                handleOrderExpiredAndRecreate();
                return;
            }

            const data = await res.json();
            
            if (data.code === "ERR_ORDER_NOT_FOUND") {
                handleOrderExpiredAndRecreate();
                return;
            }

            if (data.code === "ERR_DIRTY_COIN_DETECTED") {
                clearInterval(pollTimer);
                showToast(t("ERR_DIRTY_COIN_DETECTED"));
                const syncEl = document.getElementById('sync-text');
                syncEl.innerText = t("ERR_DIRTY_COIN_DETECTED");
                return;
            }

            if (data.success && data.paid) {
                clearInterval(pollTimer);
                if (currentCacheKey && currentStorage) {
                    currentStorage.removeItem(currentCacheKey);
                }
                const syncEl = document.getElementById('sync-text');
                syncEl.setAttribute('data-i18n', 'status_tx_confirmed');
                syncEl.innerText = t("status_tx_confirmed");
                openOrderModal(data.order);
            }
        } catch {}
    }, 3000);
}

function renderOrder(data, isFromDataToken = false) {
    currentOrderId = data.order_id;
    globalAmount = data.pay_amount;
    currentProject = data.project || "";

    if (data.order_id) {
        const searchInput = document.getElementById('input-search-key');
        if (searchInput) {
            searchInput.value = data.order_id;
        }
    }

    document.getElementById('pay-amount').innerText = data.pay_amount;
    document.getElementById('target-address').innerText = data.address;

    const productTitleWrap = document.getElementById('product-title-wrap');
    const productTitleText = document.getElementById('product-title-text');

    if (isFromDataToken && data.project && data.project !== "__CUSTOM_MODE_ORDER__") {
        productTitleText.setAttribute('data-raw-project', data.project);
        
        if (data.project === "__FIXED_ORDER__") {
            productTitleText.setAttribute('data-i18n', 'TAG_FIXED_ORDER');
        } else if (data.project === "__UNNAMED_PROJECT__") {
            productTitleText.setAttribute('data-i18n', 'TAG_UNNAMED_PROJECT');
        } else if (data.project === "__PARSE_ERROR__") {
            productTitleText.setAttribute('data-i18n', 'TAG_PARSE_ERROR');
        } else {
            productTitleText.removeAttribute('data-i18n');
        }

        productTitleText.innerText = localizeProjectName(data.project);
        productTitleWrap.classList.remove('hidden');
    } else {
        productTitleWrap.classList.add('hidden');
    }

    document.getElementById('qr-code-img').src = `https://qr-code.nodecore.workers.dev/?size=240x240&margin=0&color=0F172A&data=${encodeURIComponent(data.address)}`;

    document.getElementById('custom-amount-wrap').classList.add('hidden');
    document.getElementById('payment-display-group').classList.remove('hidden');
    
    const syncEl = document.getElementById('sync-text');
    syncEl.setAttribute('data-i18n', 'status_channel_ready');
    syncEl.innerText = t("status_channel_ready");

    startPolling(currentOrderId);
}

function switchToCustomMode(errorMsg) {
    document.getElementById('product-title-wrap').classList.add('hidden');
    document.getElementById('payment-display-group').classList.add('hidden');
    document.getElementById('custom-amount-wrap').classList.remove('hidden');
    if (errorMsg) {
        showToast(errorMsg);
    }
}

async function fetchOrder(url, isFromDataToken = false, cacheKey = null) {
    const loaderEl = document.getElementById('checkout-loader');
    loaderEl.classList.remove('hidden');

    try {
        const res = await fetch(url);
        const data = await res.json();

        if (!res.ok || !data.success) {
            const tipText = getCodeText(
                data.code, 
                isFromDataToken ? "toast_decrypt_failed" : "toast_get_pay_info_failed"
            );
            switchToCustomMode(tipText);
            return;
        }

        // 统一把有效订单写入对应的 storage（localStorage 或 sessionStorage）
        if (cacheKey && currentStorage) {
            try {
                currentStorage.setItem(cacheKey, JSON.stringify(data));
            } catch (e) {}
        }

        renderOrder(data, isFromDataToken);
    } catch (e) {
        switchToCustomMode(
            t(isFromDataToken ? "toast_ciphertext_req_error" : "toast_network_error")
        );
    } finally {
        loaderEl.classList.add('hidden');
    }
}

function submitCustomAmount() {
    const inputEl = document.getElementById('input-custom-price');
    const val = parseFloat(inputEl.value);

    if (isNaN(val) || val <= 0) {
        showToast(t("toast_input_valid_amount"));
        inputEl.focus();
        return;
    }

    // 重新输入金额提交时，主动清理旧的 session 缓存，生成全新订单
    try {
        sessionStorage.removeItem(`solpay_custom_pay_${val}`);
    } catch (e) {}

    const newUrl = new URL(window.location.origin + window.location.pathname);
    newUrl.searchParams.set('pay', val);
    window.location.href = newUrl.toString();
}

async function searchOrder() {
    const query = document.getElementById('input-search-key').value.trim();
    const btn = document.getElementById('btn-search-order');

    if (!query) {
        showToast(t("toast_input_search_query"));
        return;
    }

    btn.disabled = true;
    btn.innerText = t("btn_searching");

    try {
        const res = await fetch(`${API_BASE}/search-order?query=${encodeURIComponent(query)}`);
        const data = await res.json();

        if (!res.ok || !data.success) {
            showToast(getCodeText(data.code, "toast_order_not_found"));
            return;
        }

        openOrderModal(data.order);
    } catch (err) {
        showToast(t("toast_search_error"));
    } finally {
        btn.disabled = false;
        btn.innerText = t("btn_search");
    }
}

/**
 * 校验缓存的订单状态，如果有效则渲染，失效/已过期则重新获取新订单
 */
async function validateAndRenderCache(cachedData, fetchUrl, isFromDataToken, cacheKey) {
    const loaderEl = document.getElementById('checkout-loader');
    loaderEl.classList.remove('hidden');

    try {
        const res = await fetch(`${API_BASE}/check-status?order_id=${encodeURIComponent(cachedData.order_id)}`);
        
        // 订单在服务端已不存在/过期
        if (res.status === 404) {
            if (currentStorage && cacheKey) currentStorage.removeItem(cacheKey);
            await fetchOrder(fetchUrl, isFromDataToken, cacheKey);
            return;
        }

        const checkData = await res.json();

        // 订单无效或已被清理
        if (checkData.code === "ERR_ORDER_NOT_FOUND" || (checkData.order && checkData.order.status === "EXPIRED")) {
            if (currentStorage && cacheKey) currentStorage.removeItem(cacheKey);
            await fetchOrder(fetchUrl, isFromDataToken, cacheKey);
            return;
        }

        // 订单已支付成功
        if (checkData.success && checkData.paid) {
            if (currentStorage && cacheKey) currentStorage.removeItem(cacheKey);
            openOrderModal(checkData.order);
            return;
        }

        // 订单依然有效且未完成支付，正常显示
        renderOrder(cachedData, isFromDataToken);
    } catch (e) {
        // 网络异常时，尝试重新获取最新订单
        await fetchOrder(fetchUrl, isFromDataToken, cacheKey);
    } finally {
        loaderEl.classList.add('hidden');
    }
}

window.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('input-search-key');
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchOrder();
            }
        });
    }

    const customPriceInput = document.getElementById('input-custom-price');
    if (customPriceInput) {
        customPriceInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                submitCustomAmount();
            }
        });
    }

    if (dataToken) {
        // 密文模式：使用 localStorage 持久存储
        currentStorage = localStorage;
        currentCacheKey = `solpay_token_${dataToken.trim()}`;
        const cachedDataStr = currentStorage.getItem(currentCacheKey);
        const fetchUrl = `${API_BASE}/?data=${encodeURIComponent(dataToken)}`;

        if (cachedDataStr) {
            try {
                const cachedData = JSON.parse(cachedDataStr);
                if (cachedData && cachedData.order_id) {
                    validateAndRenderCache(cachedData, fetchUrl, true, currentCacheKey);
                    return;
                }
            } catch (e) {
                currentStorage.removeItem(currentCacheKey);
            }
        }

        fetchOrder(fetchUrl, true, currentCacheKey);
    } 
    else if (payParam && !isNaN(parseFloat(payParam)) && parseFloat(payParam) > 0) {
        // 🚀 核心修复：自定义金额模式使用 sessionStorage，防止用户 F5 刷新页面时订单号和收款地址丢失突变
        const amountVal = parseFloat(payParam);
        document.getElementById('input-custom-price').value = amountVal;

        currentStorage = sessionStorage;
        currentCacheKey = `solpay_custom_pay_${amountVal}`;
        const cachedDataStr = currentStorage.getItem(currentCacheKey);
        const fetchUrl = `${API_BASE}/?price=${encodeURIComponent(amountVal)}`;

        if (cachedDataStr) {
            try {
                const cachedData = JSON.parse(cachedDataStr);
                if (cachedData && cachedData.order_id) {
                    validateAndRenderCache(cachedData, fetchUrl, false, currentCacheKey);
                    return;
                }
            } catch (e) {
                currentStorage.removeItem(currentCacheKey);
            }
        }

        fetchOrder(fetchUrl, false, currentCacheKey);
    } 
    else {
        switchToCustomMode();
    }
});
