package com.voxlog.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.capacitorjs.plugins.statusbar.StatusBar;

public class MainActivity extends BridgeActivity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // 设置状态栏为非沉浸式，让 WebView 自动从状态栏下方开始渲染
    // 这样前端不需要自己猜测状态栏高度
    StatusBar.setOverlaysWebView({ overlay: false });
  }
}
