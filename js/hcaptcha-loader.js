(function () {
  var loadPromise;

  window.wbnLoadHCaptcha = function () {
    if (window.hcaptcha) return Promise.resolve(window.hcaptcha);
    if (loadPromise) return loadPromise;

    loadPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://js.hcaptcha.com/1/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = function () { resolve(window.hcaptcha); };
      script.onerror = function () { reject(new Error('Unable to load hCaptcha')); };
      document.head.appendChild(script);
    });

    return loadPromise;
  };
})();
