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
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;

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
            File baseDir = getSovereignDirectory("");
            JSObject ret = new JSObject();
            ret.put("basePath", baseDir.getAbsolutePath());
            ret.put("storageType", getStorageTypeString());
            
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
}
