package com.sovereign.note;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.apache.commons.net.ftp.FTPClient;

@CapacitorPlugin(name = "FTPPlugin")
public class FTPPlugin extends Plugin {

    @PluginMethod
    public void testConnection(PluginCall call) {
        String host = call.getString("host");
        Integer port = call.getInt("port", 21);
        String username = call.getString("username", "anonymous");
        String password = call.getString("password", "");

        if (host == null) {
            call.reject("Host is required");
            return;
        }

        // Network operations should not be done on the main thread
        new Thread(() -> {
            FTPClient ftp = new FTPClient();
            try {
                // Set timeout
                ftp.setConnectTimeout(5000);
                ftp.connect(host, port);
                
                boolean loginOk = ftp.login(username, password);

                if (loginOk) {
                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    ret.put("message", "FTP连接成功");
                    call.resolve(ret);
                } else {
                    call.reject("FTP登录失败");
                }
            } catch(Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "FTP连接异常");
            } finally {
                try {
                    if (ftp.isConnected()) {
                        ftp.disconnect();
                    }
                } catch(Exception ignored){}
            }
        }).start();
    }
}
