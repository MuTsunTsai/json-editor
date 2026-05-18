import { createApp } from "vue";
import { plugin as Slicksort } from "vue-slicksort";
import "bootstrap/dist/css/bootstrap.min.css";
import "./styles/global.css";
import App from "./App.vue";

const app = createApp(App);
app.use(Slicksort);
app.mount("#app");
