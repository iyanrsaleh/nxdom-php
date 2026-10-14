// Export function untuk route 'home'
export async function beranda(page, route) {
  route.register(page, async (routeName, container, routeMeta = {
    title: "Beranda | App",
    description: "Halaman beranda.",
  }, style, nav = {}) => {
    route.routeMetaByRoute.set(page, routeMeta);
    // Contoh penggunaan htmlDom().assign() - Load template dari folder theme
    // Syntax: NXUI.htmlDom().assign(file, variables, template, options)
    // try {
    //   const htmlDom = NXUI.NexaHtml();
    //  const lastRoute = await NXUI.ref.get("bucketsRoute", "lastRoute");
    //    console.log("lastRoute:", lastRoute);
    //   // Load template dengan variables
    //   const content = await htmlDom.html("home", {
    //     title: "Home Page",
    //     description: "Ini adalah halaman Home",
    //     route: routeName,
    //   }); // template default: 'theme'
    //   container.innerHTML = content.content;
    // } catch (error) {
      // Fallback jika template tidak ditemukan
      container.innerHTML = `
        <div class="main-splash">
          <img
            class="main-splash__icon"
            src="/assets/images/nx.png"
            alt=""
          />
          <div class="main-splash__headlines">
            <h1 class="main-splash__welcome">Nxdom Framework</h1>
          </div>
          <p class="main-splash__lead">
         Nusantara eXtreme Development Object Model
          </p>
        </div>
        `;
    // }
  });
}
