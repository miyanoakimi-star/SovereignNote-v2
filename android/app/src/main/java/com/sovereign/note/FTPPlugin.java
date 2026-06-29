package com.sovereign.note;

import com.getcapacitor.JSObject;
import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.apache.commons.net.ftp.FTP;
import org.apache.commons.net.ftp.FTPClient;
import org.apache.commons.net.ftp.FTPFile;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;

@CapacitorPlugin(name = "FTPPlugin")
public class FTPPlugin extends Plugin {

    private FTPClient connect(PluginCall call) throws Exception {
        String host = call.getString("host");
        if (host == null || host.trim().isEmpty()) {
            throw new IllegalArgumentException("Host is required");
        }
        Integer port = call.getInt("port", 21);
        
        // Handle host:port pattern
        if (host.contains(":")) {
            String[] parts = host.split(":");
            host = parts[0];
            try {
                port = Integer.parseInt(parts[1]);
            } catch (NumberFormatException ignored) {}
        }

        String username = call.getString("username");
        if (username == null || username.trim().isEmpty()) {
            username = call.getString("user", "anonymous");
        }
        String password = call.getString("password");
        if (password == null) {
            password = call.getString("pass", "");
        }

        FTPClient ftp = new FTPClient();
        ftp.setConnectTimeout(5000);
        ftp.setDefaultTimeout(10000);
        
        ftp.connect(host, port);
        
        boolean loginOk = ftp.login(username, password);
        if (!loginOk) {
            try {
                ftp.disconnect();
            } catch (Exception ignored) {}
            throw new Exception("FTP登录验证失败，请检查用户名或密码是否正确");
        }

        ftp.enterLocalPassiveMode();
        ftp.setFileType(FTP.BINARY_FILE_TYPE);
        
        return ftp;
    }

    private void changeToTargetDirectory(FTPClient ftp, String path) throws Exception {
        if (path == null || path.trim().isEmpty()) {
            return;
        }
        boolean success = ftp.changeWorkingDirectory(path);
        if (!success) {
            boolean makeSuccess = ftp.makeDirectory(path);
            if (makeSuccess) {
                ftp.changeWorkingDirectory(path);
            } else {
                String[] dirs = path.split("/");
                for (String dir : dirs) {
                    if (!dir.isEmpty()) {
                        if (!ftp.changeWorkingDirectory(dir)) {
                            ftp.makeDirectory(dir);
                            if (!ftp.changeWorkingDirectory(dir)) {
                                throw new Exception("无法创建或切换到目标FTP目录: " + path);
                            }
                        }
                    }
                }
            }
        }
    }

    @PluginMethod
    public void testConnection(PluginCall call) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                FTPClient ftp = null;
                try {
                    ftp = connect(call);
                    
                    String path = call.getString("path", "");
                    if (!path.trim().isEmpty()) {
                        changeToTargetDirectory(ftp, path);
                    }

                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    ret.put("message", "FTP连接且目录访问成功！");
                    call.resolve(ret);
                } catch (Exception e) {
                    call.reject(e.getMessage() != null ? e.getMessage() : "FTP连接异常");
                } finally {
                    if (ftp != null) {
                        try {
                            if (ftp.isConnected()) {
                                ftp.logout();
                                ftp.disconnect();
                            }
                        } catch (Exception ignored) {}
                    }
                }
            }
        }).start();
    }

    @PluginMethod
    public void listFiles(PluginCall call) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                FTPClient ftp = null;
                try {
                    ftp = connect(call);
                    String path = call.getString("path", "");
                    if (!path.trim().isEmpty()) {
                        changeToTargetDirectory(ftp, path);
                    }

                    FTPFile[] files = ftp.listFiles();
                    JSArray fileList = new JSArray();
                    for (FTPFile file : files) {
                        JSObject f = new JSObject();
                        f.put("name", file.getName());
                        f.put("size", file.getSize());
                        f.put("isDirectory", file.isDirectory());
                        fileList.put(f);
                    }

                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    ret.put("files", fileList);
                    call.resolve(ret);
                } catch (Exception e) {
                    call.reject(e.getMessage() != null ? e.getMessage() : "FTP获取文件列表失败");
                } finally {
                    if (ftp != null) {
                        try {
                            if (ftp.isConnected()) {
                                ftp.logout();
                                ftp.disconnect();
                            }
                        } catch (Exception ignored) {}
                    }
                }
            }
        }).start();
    }

    @PluginMethod
    public void downloadFile(PluginCall call) {
        String filename = call.getString("filename");
        if (filename == null) {
            call.reject("Filename is required");
            return;
        }

        new Thread(new Runnable() {
            @Override
            public void run() {
                FTPClient ftp = null;
                ByteArrayOutputStream out = null;
                try {
                    ftp = connect(call);
                    String path = call.getString("path", "");
                    if (!path.trim().isEmpty()) {
                        changeToTargetDirectory(ftp, path);
                    }

                    out = new ByteArrayOutputStream();
                    boolean success = ftp.retrieveFile(filename, out);
                    if (success) {
                        String content = out.toString("UTF-8");
                        JSObject ret = new JSObject();
                        ret.put("success", true);
                        ret.put("content", content);
                        call.resolve(ret);
                    } else {
                        call.reject("下载文件失败或文件不存在: " + filename);
                    }
                } catch (Exception e) {
                    call.reject(e.getMessage() != null ? e.getMessage() : "FTP下载文件异常");
                } finally {
                    if (out != null) {
                        try { out.close(); } catch (Exception ignored) {}
                    }
                    if (ftp != null) {
                        try {
                            if (ftp.isConnected()) {
                                ftp.logout();
                                ftp.disconnect();
                            }
                        } catch (Exception ignored) {}
                    }
                }
            }
        }).start();
    }

    @PluginMethod
    public void uploadFile(PluginCall call) {
        String filename = call.getString("filename");
        String content = call.getString("content");
        if (filename == null) {
            call.reject("Filename is required");
            return;
        }
        if (content == null) {
            content = "";
        }

        final String finalContent = content;
        new Thread(new Runnable() {
            @Override
            public void run() {
                FTPClient ftp = null;
                ByteArrayInputStream in = null;
                try {
                    ftp = connect(call);
                    String path = call.getString("path", "");
                    if (!path.trim().isEmpty()) {
                        changeToTargetDirectory(ftp, path);
                    }

                    in = new ByteArrayInputStream(finalContent.getBytes("UTF-8"));
                    boolean success = ftp.storeFile(filename, in);
                    if (success) {
                        JSObject ret = new JSObject();
                        ret.put("success", true);
                        ret.put("message", "文件上传成功");
                        call.resolve(ret);
                    } else {
                        call.reject("上传文件到FTP服务器失败");
                    }
                } catch (Exception e) {
                    call.reject(e.getMessage() != null ? e.getMessage() : "FTP上传文件异常");
                } finally {
                    if (in != null) {
                        try { in.close(); } catch (Exception ignored) {}
                    }
                    if (ftp != null) {
                        try {
                            if (ftp.isConnected()) {
                                ftp.logout();
                                ftp.disconnect();
                            }
                        } catch (Exception ignored) {}
                    }
                }
            }
        }).start();
    }

    @PluginMethod
    public void deleteFile(PluginCall call) {
        String filename = call.getString("filename");
        if (filename == null) {
            call.reject("Filename is required");
            return;
        }

        new Thread(new Runnable() {
            @Override
            public void run() {
                FTPClient ftp = null;
                try {
                    ftp = connect(call);
                    String path = call.getString("path", "");
                    if (!path.trim().isEmpty()) {
                        changeToTargetDirectory(ftp, path);
                    }

                    boolean success = ftp.deleteFile(filename);
                    if (success) {
                        JSObject ret = new JSObject();
                        ret.put("success", true);
                        ret.put("message", "文件删除成功");
                        call.resolve(ret);
                    } else {
                        call.reject("删除文件失败或文件不存在");
                    }
                } catch (Exception e) {
                    call.reject(e.getMessage() != null ? e.getMessage() : "FTP删除文件异常");
                } finally {
                    if (ftp != null) {
                        try {
                            if (ftp.isConnected()) {
                                ftp.logout();
                                ftp.disconnect();
                            }
                        } catch (Exception ignored) {}
                    }
                }
            }
        }).start();
    }

    @PluginMethod
    public void renameFile(PluginCall call) {
        String from = call.getString("from");
        String to = call.getString("to");
        if (from == null || to == null) {
            call.reject("Both from and to filenames are required");
            return;
        }

        new Thread(new Runnable() {
            @Override
            public void run() {
                FTPClient ftp = null;
                try {
                    ftp = connect(call);
                    String path = call.getString("path", "");
                    if (!path.trim().isEmpty()) {
                        changeToTargetDirectory(ftp, path);
                    }

                    boolean success = ftp.rename(from, to);
                    if (success) {
                        JSObject ret = new JSObject();
                        ret.put("success", true);
                        ret.put("message", "文件重命名成功");
                        call.resolve(ret);
                    } else {
                        call.reject("重命名文件失败或原文件不存在");
                    }
                } catch (Exception e) {
                    call.reject(e.getMessage() != null ? e.getMessage() : "FTP重命名文件异常");
                } finally {
                    if (ftp != null) {
                        try {
                            if (ftp.isConnected()) {
                                ftp.logout();
                                ftp.disconnect();
                            }
                        } catch (Exception ignored) {}
                    }
                }
            }
        }).start();
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("success", true);
        ret.put("message", "已断开连接");
        call.resolve(ret);
    }
}
