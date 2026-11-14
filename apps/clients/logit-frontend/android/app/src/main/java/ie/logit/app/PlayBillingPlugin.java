package ie.logit.app;

import android.content.Intent;
import android.net.Uri;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;

/**
 * Google Play Billing for LogIt subscriptions (Play Billing Library 8).
 *
 * The app never decides what someone has paid for: every purchase token goes to the LogIt
 * server (POST /billing/google/verify), which checks it with Google, switches the plan on
 * and acknowledges it. This plugin only lists products, starts purchases and lists what Play
 * says this Google account owns.
 *
 * Methods: isAvailable, getProducts, purchase, getPurchases, openSubscriptions.
 * Event: "purchasesUpdated" for purchases that change outside a purchase() call (a pending
 * payment clearing, a purchase finished after the app was closed).
 */
@CapacitorPlugin(name = "PlayBilling")
public class PlayBillingPlugin extends Plugin implements PurchasesUpdatedListener {

    private BillingClient client;
    private PluginCall pendingPurchaseCall;
    private final List<Runnable> waitingForConnection = new ArrayList<>();
    private boolean connecting = false;

    @Override
    public void load() {
        client = BillingClient.newBuilder(getContext())
            .setListener(this)
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().enablePrepaidPlans().build())
            .enableAutoServiceReconnection()
            .build();
    }

    @Override
    protected void handleOnDestroy() {
        if (client != null) client.endConnection();
    }

    // ── Connection ──────────────────────────────────────────────────────────

    private interface OnReady { void run(); }
    private interface OnFail { void run(String message); }

    private void whenConnected(OnReady ready, OnFail fail) {
        if (client.isReady()) { ready.run(); return; }
        synchronized (waitingForConnection) {
            waitingForConnection.add(() -> {
                if (client.isReady()) ready.run();
                else fail.run("Google Play isn't available on this device.");
            });
            if (connecting) return;
            connecting = true;
        }
        client.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult result) { flush(); }

            @Override
            public void onBillingServiceDisconnected() { flush(); }

            private void flush() {
                List<Runnable> run;
                synchronized (waitingForConnection) {
                    connecting = false;
                    run = new ArrayList<>(waitingForConnection);
                    waitingForConnection.clear();
                }
                for (Runnable r : run) r.run();
            }
        });
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        whenConnected(
            () -> { JSObject r = new JSObject(); r.put("available", true); call.resolve(r); },
            msg -> { JSObject r = new JSObject(); r.put("available", false); call.resolve(r); });
    }

    // ── Products ────────────────────────────────────────────────────────────

    @PluginMethod
    public void getProducts(PluginCall call) {
        JSArray ids = call.getArray("productIds");
        List<QueryProductDetailsParams.Product> products = new ArrayList<>();
        try {
            for (String id : ids.<String>toList()) {
                products.add(QueryProductDetailsParams.Product.newBuilder()
                    .setProductId(id)
                    .setProductType(BillingClient.ProductType.SUBS)
                    .build());
            }
        } catch (Exception e) {
            call.reject("productIds must be a list of strings.");
            return;
        }
        if (products.isEmpty()) { call.reject("productIds is empty."); return; }

        whenConnected(() -> client.queryProductDetailsAsync(
            QueryProductDetailsParams.newBuilder().setProductList(products).build(),
            (result, details) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    call.reject(describe(result), code(result));
                    return;
                }
                JSArray out = new JSArray();
                for (ProductDetails p : details.getProductDetailsList()) out.put(toJs(p));
                JSObject r = new JSObject();
                r.put("products", out);
                call.resolve(r);
            }), msg -> call.reject(msg, "unavailable"));
    }

    private static JSObject toJs(ProductDetails p) {
        JSObject o = new JSObject();
        o.put("productId", p.getProductId());
        o.put("name", p.getName());
        JSArray offers = new JSArray();
        List<ProductDetails.SubscriptionOfferDetails> list = p.getSubscriptionOfferDetails();
        if (list != null) {
            for (ProductDetails.SubscriptionOfferDetails d : list) {
                JSObject offer = new JSObject();
                offer.put("basePlanId", d.getBasePlanId());
                offer.put("offerId", d.getOfferId());
                offer.put("offerToken", d.getOfferToken());
                JSArray phases = new JSArray();
                for (ProductDetails.PricingPhase ph : d.getPricingPhases().getPricingPhaseList()) {
                    JSObject phase = new JSObject();
                    phase.put("formattedPrice", ph.getFormattedPrice());
                    phase.put("priceMicros", ph.getPriceAmountMicros());
                    phase.put("currency", ph.getPriceCurrencyCode());
                    phase.put("billingPeriod", ph.getBillingPeriod());
                    phase.put("cycles", ph.getBillingCycleCount());
                    phase.put("recurrence", ph.getRecurrenceMode());
                    phases.put(phase);
                }
                offer.put("phases", phases);
                offers.put(offer);
            }
        }
        o.put("offers", offers);
        return o;
    }

    // ── Buying ──────────────────────────────────────────────────────────────

    /**
     * Options: productId, offerToken, accountId (the LogIt user id, so the server can tell
     * which account a purchase belongs to), and for a plan change oldPurchaseToken.
     * Resolves { status: "purchased" | "pending" | "cancelled", purchaseToken? }.
     */
    // setSubscriptionReplacementMode is deprecated since Billing 8.1 in favour of per-product
    // replacement params (made for multi-product subscriptions). Still supported in 8.x and the
    // documented way to switch a single-product subscription; revisit when moving to Billing 9.
    @SuppressWarnings("deprecation")
    @PluginMethod
    public void purchase(PluginCall call) {
        String productId = call.getString("productId");
        String offerToken = call.getString("offerToken");
        String accountId = call.getString("accountId");
        String oldToken = call.getString("oldPurchaseToken");
        if (productId == null || offerToken == null || accountId == null) {
            call.reject("productId, offerToken and accountId are required.");
            return;
        }
        if (pendingPurchaseCall != null) {
            call.reject("A purchase is already in progress.", "busy");
            return;
        }

        whenConnected(() -> client.queryProductDetailsAsync(
            QueryProductDetailsParams.newBuilder().setProductList(List.of(
                QueryProductDetailsParams.Product.newBuilder()
                    .setProductId(productId)
                    .setProductType(BillingClient.ProductType.SUBS)
                    .build())).build(),
            (result, details) -> {
                List<ProductDetails> found = details.getProductDetailsList();
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || found.isEmpty()) {
                    call.reject("Google Play doesn't offer " + productId + " right now.", "product_unavailable");
                    return;
                }
                BillingFlowParams.Builder params = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(List.of(
                        BillingFlowParams.ProductDetailsParams.newBuilder()
                            .setProductDetails(found.get(0))
                            .setOfferToken(offerToken)
                            .build()))
                    .setObfuscatedAccountId(accountId);
                if (oldToken != null && !oldToken.isEmpty()) {
                    // Pro <-> Studio: switch now, crediting the unused time.
                    params.setSubscriptionUpdateParams(BillingFlowParams.SubscriptionUpdateParams.newBuilder()
                        .setOldPurchaseToken(oldToken)
                        .setSubscriptionReplacementMode(
                            BillingFlowParams.SubscriptionUpdateParams.ReplacementMode.WITH_TIME_PRORATION)
                        .build());
                }
                getActivity().runOnUiThread(() -> {
                    pendingPurchaseCall = call;
                    BillingResult launch = client.launchBillingFlow(getActivity(), params.build());
                    if (launch.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        pendingPurchaseCall = null;
                        call.reject(describe(launch), code(launch));
                    }
                });
            }), msg -> call.reject(msg, "unavailable"));
    }

    @Override
    public void onPurchasesUpdated(BillingResult result, List<Purchase> purchases) {
        PluginCall call = pendingPurchaseCall;
        pendingPurchaseCall = null;
        int rc = result.getResponseCode();

        if (call == null) {
            // Not from purchase(): tell the web layer so it can report it to the server.
            if (rc == BillingClient.BillingResponseCode.OK && purchases != null) {
                JSObject ev = new JSObject();
                ev.put("purchases", toJs(purchases));
                notifyListeners("purchasesUpdated", ev);
            }
            return;
        }

        JSObject r = new JSObject();
        if (rc == BillingClient.BillingResponseCode.USER_CANCELED) {
            r.put("status", "cancelled");
            call.resolve(r);
            return;
        }
        if (rc != BillingClient.BillingResponseCode.OK || purchases == null || purchases.isEmpty()) {
            call.reject(describe(result), code(result));
            return;
        }
        Purchase p = purchases.get(0);
        r.put("status", p.getPurchaseState() == Purchase.PurchaseState.PURCHASED ? "purchased" : "pending");
        r.put("purchaseToken", p.getPurchaseToken());
        call.resolve(r);
    }

    // ── Owned purchases ─────────────────────────────────────────────────────

    /** What this Google account owns. Resolves { purchases: [{ purchaseToken, productIds, state, acknowledged, accountId }] }. */
    @PluginMethod
    public void getPurchases(PluginCall call) {
        whenConnected(() -> client.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(),
            (result, purchases) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    call.reject(describe(result), code(result));
                    return;
                }
                JSObject r = new JSObject();
                r.put("purchases", toJs(purchases));
                call.resolve(r);
            }), msg -> call.reject(msg, "unavailable"));
    }

    private static JSArray toJs(List<Purchase> purchases) {
        JSArray out = new JSArray();
        for (Purchase p : purchases) {
            JSObject o = new JSObject();
            o.put("purchaseToken", p.getPurchaseToken());
            o.put("productIds", new JSArray(p.getProducts()));
            o.put("state", p.getPurchaseState() == Purchase.PurchaseState.PURCHASED ? "purchased"
                : p.getPurchaseState() == Purchase.PurchaseState.PENDING ? "pending" : "unknown");
            o.put("acknowledged", p.isAcknowledged());
            o.put("autoRenewing", p.isAutoRenewing());
            if (p.getAccountIdentifiers() != null) o.put("accountId", p.getAccountIdentifiers().getObfuscatedAccountId());
            out.put(o);
        }
        return out;
    }

    // ── Managing ────────────────────────────────────────────────────────────

    /** Opens Play's subscription page (for productId if given), where people cancel or fix payment. */
    @PluginMethod
    public void openSubscriptions(PluginCall call) {
        String productId = call.getString("productId");
        String url = "https://play.google.com/store/account/subscriptions";
        if (productId != null && !productId.isEmpty()) {
            url += "?sku=" + Uri.encode(productId) + "&package=" + Uri.encode(getContext().getPackageName());
        }
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    // ── Errors ──────────────────────────────────────────────────────────────

    private static String code(BillingResult r) {
        switch (r.getResponseCode()) {
            case BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED: return "already_owned";
            case BillingClient.BillingResponseCode.SERVICE_UNAVAILABLE:
            case BillingClient.BillingResponseCode.SERVICE_DISCONNECTED:
            case BillingClient.BillingResponseCode.BILLING_UNAVAILABLE:
            case BillingClient.BillingResponseCode.NETWORK_ERROR: return "unavailable";
            case BillingClient.BillingResponseCode.ITEM_UNAVAILABLE: return "product_unavailable";
            default: return "billing_error_" + r.getResponseCode();
        }
    }

    private static String describe(BillingResult r) {
        String msg = r.getDebugMessage();
        return "Google Play: " + (msg == null || msg.isEmpty() ? "error " + r.getResponseCode() : msg);
    }
}
