package com.sovereign.note;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;

public class MainActivity extends BridgeActivity {
    private static String pendingShareData = null;

    public static String getAndClearPendingShareText() {
        String temp = pendingShareData;
        pendingShareData = null;
        return temp;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerPlugin(FTPPlugin.class);
        registerPlugin(SovereignNativePlugin.class);

        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        String type = intent.getType();

        if (Intent.ACTION_SEND.equals(action) && type != null) {
            if ("text/plain".equals(type)) {
                String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
                String sharedSubject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
                
                try {
                    JSObject obj = new JSObject();
                    obj.put("title", sharedSubject != null ? sharedSubject : "");
                    obj.put("text", sharedText != null ? sharedText : "");
                    pendingShareData = obj.toString();
                } catch (Exception ignored) {
                    pendingShareData = "{\"title\":\"\",\"text\":\"" + (sharedText != null ? sharedText.replace("\"", "\\\"") : "") + "\"}";
                }
            }
        }
    }
}
