// 小程序入口：在启动时把 engine 的存储换成 wx 同步 API。
// 必须在任何页面读写数据之前执行，故放在 App.onLaunch 的最前面。
import { installWxStorage } from './core/platform';

App({
  onLaunch() {
    installWxStorage();
  },
});
