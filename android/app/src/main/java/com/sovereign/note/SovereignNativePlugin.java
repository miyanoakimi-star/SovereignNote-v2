package com.sovereign.note;

import android.content.Intent;
import android.net.Uri;
import android.os.Environment;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;

@CapacitorPlugin(name = "SovereignNativePlugin")
public class SovereignNativePlugin extends Plugin {

    private File getSovereignDirectory(String folderName) {
        File baseDir = new File(Environment.getExternalStoragePublicDirectory(
                Environment.DIRECTORY_DOWNLOADS), "SovereignNote");
        
        if (!baseDir.exists()) {
            baseDir.mkdirs();
        }

        File targetDir = folderName != null && !folderName.isEmpty() ? new File(baseDir, folderName) : baseDir;
        if (!targetDir.exists()) {
            targetDir.mkdirs();
        }

        // Validate if indeed writable by performing a tiny write check
        boolean isWritable = false;
        try {
            File testFile = new File(targetDir, ".write_test");
            if (testFile.createNewFile()) {
                testFile.delete();
                isWritable = true;
            } else if (testFile.exists()) {
                testFile.delete();
                isWritable = true;
            }
        } catch (Exception e) {
            isWritable = false;
        }

        if (!isWritable) {
            // Fallback to app-specific external files dir (always writable, no permission required)
            File fallbackBase = getContext().getExternalFilesDir(null);
            if (fallbackBase == null) {
                fallbackBase = getContext().getFilesDir();
            }
            baseDir = new File(fallbackBase, "SovereignNote");
            if (!baseDir.exists()) {
                baseDir.mkdirs();
            }
            targetDir = folderName != null && !folderName.isEmpty() ? new File(baseDir, folderName) : baseDir;
            if (!targetDir.exists()) {
                targetDir.mkdirs();
            }
        }

        return targetDir;
    }

    private String getStorageTypeString() {
        File baseDir = new File(Environment.getExternalStoragePublicDirectory(
                Environment.DIRECTORY_DOWNLOADS), "SovereignNote");
        
        boolean isWritable = false;
        try {
            if (!baseDir.exists()) {
                baseDir.mkdirs();
            }
            File testFile = new File(baseDir, ".write_test");
            if (testFile.createNewFile()) {
                testFile.delete();
                isWritable = true;
            } else if (testFile.exists()) {
                testFile.delete();
                isWritable = true;
            }
        } catch (Exception e) {
            isWritable = false;
        }

        return isWritable ? "公共 Downloads/SovereignNote 目录" : "应用私有/SovereignNote 安全沙盒";
    }

    @PluginMethod
    public void getStoragePathInfo(PluginCall call) {
        try {
            File extDir = new File(Environment.getExternalStoragePublicDirectory(
                    Environment.DIRECTORY_DOWNLOADS), "SovereignNote");
            
            File intDir = getContext().getExternalFilesDir(null);
            if (intDir == null) {
                intDir = getContext().getFilesDir();
            }
            intDir = new File(intDir, "SovereignNote");

            File activeDir = getSovereignDirectory("");
            boolean isWritable = activeDir.getAbsolutePath().equals(extDir.getAbsolutePath());

            File backupDir = getSovereignDirectory("backup");
            File[] backupFiles = backupDir.listFiles();
            int backupCount = backupFiles != null ? backupFiles.length : 0;

            JSObject ret = new JSObject();
            ret.put("basePath", activeDir.getAbsolutePath());
            ret.put("externalSovereignDir", extDir.getAbsolutePath());
            ret.put("internalSovereignDir", intDir.getAbsolutePath());
            ret.put("storageType", getStorageTypeString());
            ret.put("isWritable", isWritable || activeDir.canWrite());
            ret.put("backupCount", backupCount);
            
            // Return folder mappings
            JSObject folders = new JSObject();
            String[] folderNames = {"backup", "database", "export", "logs", "settings", "sync", "temp"};
            for (String f : folderNames) {
                folders.put(f, getSovereignDirectory(f).getAbsolutePath());
            }
            ret.put("folders", folders);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("获取存储路径信息失败: " + e.getMessage());
        }
    }

    @PluginMethod
    public void exportFile(PluginCall call) {
        String folderName = call.getString("folderName", "");
        String filename = call.getString("filename");
        String content = call.getString("content");

        if (filename == null) {
            call.reject("Filename is required");
            return;
        }
        if (content == null) {
            content = "";
        }

        try {
            File dir = getSovereignDirectory(folderName);
            File file = new File(dir, filename);
            
            FileOutputStream fos = new FileOutputStream(file);
            OutputStreamWriter osw = new OutputStreamWriter(fos, StandardCharsets.UTF_8);
            osw.write(content);
            osw.flush();
            osw.close();
            fos.close();

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("path", file.getAbsolutePath());
            ret.put("message", "导出文件成功");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("导出文件失败: " + e.getMessage());
        }
    }

    @PluginMethod
    public void importFile(PluginCall call) {
        String folderName = call.getString("folderName", "");
        String filename = call.getString("filename");

        if (filename == null) {
            call.reject("Filename is required");
            return;
        }

        try {
            File dir = getSovereignDirectory(folderName);
            File file = new File(dir, filename);
            if (!file.exists()) {
                call.reject("文件不存在: " + filename);
                return;
            }

            FileInputStream fis = new FileInputStream(file);
            InputStreamReader isr = new InputStreamReader(fis, StandardCharsets.UTF_8);
            BufferedReader reader = new BufferedReader(isr);
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append("\n");
            }
            reader.close();
            isr.close();
            fis.close();

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("content", sb.toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("导入文件失败: " + e.getMessage());
        }
    }

    @PluginMethod
    public void listFiles(PluginCall call) {
        String folderName = call.getString("folderName", "");

        try {
            File dir = getSovereignDirectory(folderName);
            File[] files = dir.listFiles();
            JSArray fileList = new JSArray();
            
            if (files != null) {
                for (File f : files) {
                    if (f.getName().startsWith(".")) {
                        continue; // skip hidden files
                    }
                    JSObject item = new JSObject();
                    item.put("name", f.getName());
                    item.put("size", f.length());
                    item.put("isDirectory", f.isDirectory());
                    item.put("lastModified", f.lastModified());
                    fileList.put(item);
                }
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("files", fileList);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("获取文件列表失败: " + e.getMessage());
        }
    }

    @PluginMethod
    public void deleteFile(PluginCall call) {
        String folderName = call.getString("folderName", "");
        String filename = call.getString("filename");

        if (filename == null) {
            call.reject("Filename is required");
            return;
        }

        try {
            File dir = getSovereignDirectory(folderName);
            File file = new File(dir, filename);
            if (!file.exists()) {
                call.reject("文件不存在: " + filename);
                return;
            }

            boolean deleted = file.delete();
            JSObject ret = new JSObject();
            ret.put("success", deleted);
            ret.put("message", deleted ? "文件删除成功" : "文件删除失败");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("删除文件失败: " + e.getMessage());
        }
    }

    @PluginMethod
    public void shareFile(PluginCall call) {
        String folderName = call.getString("folderName", "");
        String filename = call.getString("filename");
        String mimeType = call.getString("mimeType", "application/json");

        if (filename == null) {
            call.reject("Filename is required");
            return;
        }

        try {
            File dir = getSovereignDirectory(folderName);
            File file = new File(dir, filename);
            if (!file.exists()) {
                call.reject("文件不存在: " + filename);
                return;
            }

            Uri uri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    file
            );

            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType(mimeType);
            intent.putExtra(Intent.EXTRA_STREAM, uri);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Intent chooser = Intent.createChooser(intent, "分享文件: " + filename);
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(chooser);

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("调用分享失败: " + e.getMessage());
        }
    }

    @PluginMethod
    public void shareText(PluginCall call) {
        String text = call.getString("text");
        String title = call.getString("title", "分享自 SovereignNote");

        if (text == null) {
            call.reject("Text is required");
            return;
        }

        try {
            Intent intent = new Intent(Intent.ACTION_SEND);
            intent.setType("text/plain");
            intent.putExtra(Intent.EXTRA_TEXT, text);
            intent.putExtra(Intent.EXTRA_SUBJECT, title);

            Intent chooser = Intent.createChooser(intent, title);
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(chooser);

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("分享文本失败: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getPendingShareIntent(PluginCall call) {
        try {
            String pendingData = MainActivity.getAndClearPendingShareText();
            JSObject ret = new JSObject();
            if (pendingData != null && !pendingData.isEmpty()) {
                ret.put("hasShare", true);
                ret.put("data", new JSObject(pendingData));
            } else {
                ret.put("hasShare", false);
            }
            call.resolve(ret);
        } catch (Exception e) {
            // Fail gracefully if format parsing fails, return as raw text
            try {
                String pendingData = MainActivity.getAndClearPendingShareText();
                JSObject ret = new JSObject();
                if (pendingData != null && !pendingData.isEmpty()) {
                    ret.put("hasShare", true);
                    JSObject fallbackObj = new JSObject();
                    fallbackObj.put("title", "系统分享内容");
                    fallbackObj.put("text", pendingData);
                    ret.put("data", fallbackObj);
                } else {
                    ret.put("hasShare", false);
                }
                call.resolve(ret);
            } catch (Exception ex) {
                call.reject("获取分享意图失败: " + ex.getMessage());
            }
        }
    }

    @PluginMethod
    public void httpRequest(PluginCall call) {
        final String urlStr = call.getString("url");
        final String method = call.getString("method", "GET").toUpperCase();
        final JSObject headers = call.getObject("headers", new JSObject());
        final String body = call.getString("body", null);
        final int timeoutMs = call.getInt("timeoutMs", 60000);

        if (urlStr == null || urlStr.trim().isEmpty()) {
            call.reject("请求 URL 不能为空");
            return;
        }

        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                URL parsedUrl = new URL(urlStr.trim());
                String protocol = parsedUrl.getProtocol() != null ? parsedUrl.getProtocol().toLowerCase() : "";
                if (!"http".equals(protocol) && !"https".equals(protocol)) {
                    call.reject("仅支持 http 或 https 协议请求");
                    return;
                }

                conn = (HttpURLConnection) parsedUrl.openConnection();
                conn.setInstanceFollowRedirects(false);
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(timeoutMs > 0 ? timeoutMs : 60000);
                conn.setRequestMethod(method);

                if (headers != null) {
                    Iterator<String> keys = headers.keys();
                    while (keys.hasNext()) {
                        String key = keys.next();
                        String val = headers.getString(key);
                        if (val != null) {
                            conn.setRequestProperty(key, val);
                        }
                    }
                }

                if (body != null && !"GET".equals(method) && !"HEAD".equals(method)) {
                    conn.setDoOutput(true);
                    byte[] payloadBytes = body.getBytes(StandardCharsets.UTF_8);
                    try (OutputStream os = conn.getOutputStream()) {
                        os.write(payloadBytes);
                        os.flush();
                    }
                }

                int status = conn.getResponseCode();
                InputStream stream = (status >= 200 && status < 400)
                        ? conn.getInputStream()
                        : conn.getErrorStream();

                StringBuilder responseBuilder = new StringBuilder();
                if (stream != null) {
                    try (BufferedReader reader = new BufferedReader(
                            new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                        String line;
                        while ((line = reader.readLine()) != null) {
                            if (responseBuilder.length() > 0) {
                                responseBuilder.append('\n');
                            }
                            responseBuilder.append(line);
                        }
                    }
                }

                JSObject ret = new JSObject();
                ret.put("ok", status >= 200 && status < 300);
                ret.put("status", status);
                ret.put("text", responseBuilder.toString());
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("原生网络请求失败: " + (e.getMessage() != null ? e.getMessage() : e.toString()));
            } finally {
                if (conn != null) {
                    conn.disconnect();
                }
            }
        }).start();
    }
}
