/**
 * Copyright 2015 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {AmpDocShadow, AmpDocSingle} from '../../src/service/ampdoc-impl';
import {Observable} from '../../src/observable';
import {adopt, adoptShadowMode} from '../../src/runtime';
import {dev} from '../../src/log';
import {
  getServiceForDoc,
  getServicePromise,
  getServicePromiseOrNullForDoc,
} from '../../src/service';
import {installPlatformService} from '../../src/service/platform-impl';
import {parseUrl} from '../../src/url';
import {platformFor} from '../../src/platform';
import * as ext from '../../src/service/extensions-impl';
import * as extel from '../../src/extended-element';
import * as styles from '../../src/style-installer';
import * as shadowembed from '../../src/shadow-embed';
import * as dom from '../../src/dom';
import * as sinon from 'sinon';


describes.sandboxed('runtime', {}, () => {

  let win;
  let errorStub;
  let ampdocService;
  let ampdocServiceMock;

  beforeEach(() => {
    ampdocService = {
      isSingleDoc: () => true,
      getAmpDoc: () => null,
      installShadowDoc_: () => null,
    };
    ampdocServiceMock = sandbox.mock(ampdocService);
    win = {
      localStorage: {},
      AMP: [],
      location: parseUrl('https://cdn.ampproject.org/c/s/www.example.com/path'),
      addEventListener: () => {},
      document: window.document,
      history: {},
      navigator: {},
      setTimeout: () => {},
      Object,
      HTMLElement,
      services: {
        ampdoc: {obj: ampdocService},
      },
    };
    ampdocService.getAmpDoc = () => new AmpDocSingle(win);
    installPlatformService(win);
    errorStub = sandbox.stub(dev(), 'error');
  });

  afterEach(() => {
    ampdocServiceMock.verify();
  });

  it('should convert AMP from array to AMP object in single-doc', () => {
    expect(win.AMP.push).to.equal([].push);
    adopt(win);
    expect(win.AMP.push).to.not.equal([].push);
    expect(win.AMP_TAG).to.be.true;
  });

  it('should convert AMP from array to AMP object in shadow-doc', () => {
    expect(win.AMP.push).to.equal([].push);
    adoptShadowMode(win);
    expect(win.AMP.push).to.not.equal([].push);
    expect(win.AMP_TAG).to.be.true;
  });

  it('should NOT set cursor:pointer on document element on non-IOS', () => {
    const platform = platformFor(win);
    sandbox.stub(platform, 'isIos').returns(false);
    adopt(win);
    expect(win.document.documentElement.style.cursor).to.not.be.ok;
  });

  it('should set cursor:pointer on document element on IOS', () => {
    const platform = platformFor(win);
    sandbox.stub(platform, 'isIos').returns(true);
    adopt(win);
    expect(win.document.documentElement.style.cursor).to.equal('pointer');
  });

  it('should set cursor:pointer on IOS in shadow-doc', () => {
    const platform = platformFor(win);
    sandbox.stub(platform, 'isIos').returns(true);
    adoptShadowMode(win);
    expect(win.document.documentElement.style.cursor).to.equal('pointer');
  });

  it('should execute scheduled extensions & execute new extensions', () => {
    let progress = '';
    const queueExtensions = win.AMP;
    win.AMP.push(amp => {
      expect(amp).to.equal(win.AMP);
      progress += '1';
    });
    win.AMP.push(amp => {
      expect(amp).to.equal(win.AMP);
      progress += '2';
    });
    win.AMP.push(amp => {
      expect(amp).to.equal(win.AMP);
      progress += '3';
    });
    expect(queueExtensions).to.have.length(3);
    adopt(win);
    expect(queueExtensions).to.have.length(0);
    expect(progress).to.equal('123');
    win.AMP.push(amp => {
      expect(amp).to.equal(win.AMP);
      progress += '4';
    });
    expect(progress).to.equal('1234');
    win.AMP.push(amp => {
      expect(amp).to.equal(win.AMP);
      progress += '5';
    });
    expect(progress).to.equal('12345');
    expect(queueExtensions).to.have.length(0);
  });

  it('should execute function and struct AMP.push callbacks', () => {
    // New format: {n:string, f:function()}.
    let progress = '';
    const queueExtensions = win.AMP;

    // Queue mode.
    win.AMP.push(amp => {
      expect(amp).to.equal(win.AMP);
      progress += '1';
    });
    win.AMP.push({
      n: 'ext1',
      f: amp => {
        expect(amp).to.equal(win.AMP);
        progress += 'A';
      },
    });
    expect(queueExtensions).to.have.length(2);
    expect(progress).to.equal('');
    adopt(win);
    expect(queueExtensions).to.have.length(0);
    expect(progress).to.equal('1A');

    // Runtime mode.
    win.AMP.push(amp => {
      expect(amp).to.equal(win.AMP);
      progress += '2';
    });
    win.AMP.push({
      n: 'ext2',
      f: amp => {
        expect(amp).to.equal(win.AMP);
        progress += 'B';
      },
    });
    expect(queueExtensions).to.have.length(0);
    expect(progress).to.equal('1A2B');

    const extensions = ext.installExtensionsService(win);
    const ext1 = extensions.waitForExtension('ext1');
    const ext2 = extensions.waitForExtension('ext2');
    return Promise.all([ext1, ext2]);
  });

  it('should wait for body before processing extensions', () => {
    const bodyCallbacks = new Observable();
    sandbox.stub(dom, 'waitForBody', (unusedDoc, callback) => {
      bodyCallbacks.add(callback);
    });

    let progress = '';
    const queueExtensions = win.AMP;
    win.AMP.push(amp => {
      expect(amp).to.equal(win.AMP);
      progress += '1';
    });
    win.AMP.push(amp => {
      expect(amp).to.equal(win.AMP);
      progress += '2';
    });
    win.AMP.push(amp => {
      expect(amp).to.equal(win.AMP);
      progress += '3';
    });
    expect(queueExtensions).to.have.length(3);
    adopt(win);

    // Extensions are still unprocessed
    expect(queueExtensions).to.have.length(3);
    expect(progress).to.equal('');

    // Add one more
    win.AMP.push(amp => {
      expect(amp).to.equal(win.AMP);
      progress += '4';
    });
    expect(queueExtensions).to.have.length(3);
    expect(progress).to.equal('');

    // Body is available now.
    bodyCallbacks.fire();
    expect(progress).to.equal('1234');
    expect(queueExtensions).to.have.length(0);
  });

  it('should be robust against errors in early extensions', () => {
    let progress = '';
    win.AMP.push(() => {
      progress += '1';
    });
    win.AMP.push(() => {
      throw new Error('extension error');
    });
    win.AMP.push(() => {
      progress += '3';
    });
    adopt(win);
    expect(progress).to.equal('13');

    expect(errorStub.callCount).to.equal(1);
    expect(errorStub).to.be.calledWith('runtime',
        sinon.match(() => true),
        sinon.match(arg => {
          return !!arg.message.match(/extension error/);
        }));
  });

  describe('single-mode', () => {
    let extensions;
    let registerStub;

    beforeEach(() => {
      adopt(win);
      extensions = ext.installExtensionsService(win);
      registerStub = sandbox.stub(extel, 'registerExtendedElement');
    });

    it('should export properties to global AMP object', () => {
      expect(win.AMP.BaseElement).to.be.a('function');
      expect(win.AMP.BaseTemplate).to.be.a('function');
      expect(win.AMP.registerElement).to.be.a('function');
      expect(win.AMP.registerTemplate).to.be.a('function');
      expect(win.AMP.setTickFunction).to.be.a('function');
      expect(win.AMP.win).to.equal(win);

      expect(win.AMP.viewer).to.be.a('object');
      expect(win.AMP.viewport).to.be.a('object');
      // Single-doc mode does not create `attachShadowDoc`.
      expect(win.AMP.attachShadowDoc).to.not.exist;
    });

    it('should register element without CSS', () => {
      const servicePromise = getServicePromise(win, 'amp-ext');
      const installStylesStub = sandbox.stub(styles, 'installStyles');

      win.AMP.push({
        n: 'amp-ext',
        f: amp => {
          amp.registerElement('amp-ext', win.AMP.BaseElement);
        },
      });

      // Extension is added immediately. Can't find for micro-tasks here.
      const ext = extensions.extensions_['amp-ext'].extension;
      expect(ext.elements['amp-ext']).exist;
      expect(ext.elements['amp-ext'].implementationClass)
          .to.equal(win.AMP.BaseElement);

      // No installStyles calls.
      expect(installStylesStub.callCount).to.equal(0);

      // Register is called immediately as well.
      expect(registerStub.calledWithExactly(win, 'amp-ext', AMP.BaseElement))
          .to.be.true;

      // Service and extensions are resolved.
      return Promise.all([
        extensions.waitForExtension('amp-ext'),
        servicePromise]);
    });

    it('should register element with CSS', () => {
      const servicePromise = getServicePromise(win, 'amp-ext');
      let installStylesCallback;
      const installStylesStub = sandbox.stub(styles, 'installStyles',
          (doc, cssText, cb) => {
            installStylesCallback = cb;
          });

      win.AMP.push({
        n: 'amp-ext',
        f: amp => {
          amp.registerElement('amp-ext', win.AMP.BaseElement, 'a{}');
        },
      });

      // Extension is added immediately. Can't find for micro-tasks here.
      const ext = extensions.extensions_['amp-ext'].extension;
      expect(ext.elements['amp-ext']).exist;
      expect(ext.elements['amp-ext'].implementationClass)
          .to.equal(win.AMP.BaseElement);
      expect(ext.elements['amp-ext'].css).to.equal('a{}');

      expect(installStylesStub.callCount).to.equal(1);
      expect(installStylesStub.calledWithExactly(
          win.document,
          'a{}',
          installStylesCallback,
          /* isRuntimeCss */ false,
          /* ext */ 'amp-ext')).to.be.true;

      // Element resistration is not done until callback.
      expect(registerStub.callCount).to.equal(0);
      installStylesCallback();
      expect(registerStub.callCount).to.equal(1);
      expect(registerStub.calledWithExactly(win, 'amp-ext',
          AMP.BaseElement)).to.be.true;

      // Service and extensions are resolved.
      return Promise.all([
        extensions.waitForExtension('amp-ext'),
        servicePromise]);
    });

    it('should register doc-service as ctor and install it immediately', () => {
      class Service1 {}
      const ampdoc = new AmpDocSingle(win);
      ampdocServiceMock.expects('getAmpDoc')
          .returns(ampdoc)
          .atLeast(1);
      win.AMP.push({
        n: 'amp-ext',
        f: amp => {
          amp.registerServiceForDoc('service1', Service1);
        },
      });

      // No factories
      const extHolder = extensions.extensions_['amp-ext'];
      expect(extHolder.docFactories).to.have.length(0);

      // Already installed.
      expect(getServiceForDoc(ampdoc, 'service1')).to.be.instanceOf(Service1);

      // The main top-level service is also pinged to unblock render.
      return getServicePromise(win, 'service1');
    });

    it('should register doc-service factory and install it immediately', () => {
      function factory() {
        return 'A';
      }
      const ampdoc = new AmpDocSingle(win);
      ampdocServiceMock.expects('getAmpDoc')
          .returns(ampdoc)
          .atLeast(1);
      win.AMP.push({
        n: 'amp-ext',
        f: amp => {
          amp.registerServiceForDoc('service1', undefined, factory);
        },
      });

      // No factories
      const extHolder = extensions.extensions_['amp-ext'];
      expect(extHolder.docFactories).to.have.length(0);

      // Already installed.
      expect(getServiceForDoc(ampdoc, 'service1')).to.equal('A');
    });
  });

  describe('shadow-mode', () => {
    let extensions;
    let registerStub;

    beforeEach(() => {
      adoptShadowMode(win);
      extensions = ext.installExtensionsService(win);
      registerStub = sandbox.stub(extel, 'registerExtendedElement');
    });

    it('should export properties to global AMP object', () => {
      expect(win.AMP.BaseElement).to.be.a('function');
      expect(win.AMP.BaseTemplate).to.be.a('function');
      expect(win.AMP.registerElement).to.be.a('function');
      expect(win.AMP.registerTemplate).to.be.a('function');
      expect(win.AMP.setTickFunction).to.be.a('function');
      expect(win.AMP.win).to.equal(win);

      expect(win.AMP.attachShadowDoc).to.be.a('function');

      expect(win.AMP.viewer).to.not.exist;
      expect(win.AMP.viewport).to.not.exist;
    });

    it('should register element without CSS', () => {
      const servicePromise = getServicePromise(win, 'amp-ext');
      const installStylesStub = sandbox.stub(shadowembed,
          'installStylesForShadowRoot');

      win.AMP.push({
        n: 'amp-ext',
        f: amp => {
          amp.registerElement('amp-ext', win.AMP.BaseElement);
        },
      });

      // Extension is added immediately. Can't find for micro-tasks here.
      const extHolder = extensions.extensions_['amp-ext'];
      const ext = extHolder.extension;
      expect(ext.elements['amp-ext']).exist;
      expect(ext.elements['amp-ext'].implementationClass)
          .to.equal(win.AMP.BaseElement);

      // No installStyles calls and no factories.
      expect(installStylesStub.callCount).to.equal(0);
      expect(extHolder.docFactories).to.have.length(0);
      expect(extHolder.shadowRootFactories).to.have.length(0);

      // Register is called immediately as well.
      expect(registerStub.calledWithExactly(win, 'amp-ext', AMP.BaseElement))
          .to.be.true;

      // Service and extensions are resolved.
      return Promise.all([
        extensions.waitForExtension('amp-ext'),
        servicePromise]);
    });

    it('should register element with CSS', () => {
      const servicePromise = getServicePromise(win, 'amp-ext');
      const installStylesStub = sandbox.stub(shadowembed,
          'installStylesForShadowRoot');

      win.AMP.push({
        n: 'amp-ext',
        f: amp => {
          amp.registerElement('amp-ext', win.AMP.BaseElement, 'a{}');
        },
      });

      // Extension is added immediately. Can't find for micro-tasks here.
      const extHolder = extensions.extensions_['amp-ext'];
      const ext = extHolder.extension;
      expect(ext.elements['amp-ext']).exist;
      expect(ext.elements['amp-ext'].implementationClass)
          .to.equal(win.AMP.BaseElement);
      expect(ext.elements['amp-ext'].css).to.equal('a{}');

      // Register is called immediately as well.
      expect(registerStub.calledWithExactly(win, 'amp-ext', AMP.BaseElement))
          .to.be.true;

      // No installStyles calls, but there's a factory.
      expect(installStylesStub.callCount).to.equal(0);
      expect(extHolder.shadowRootFactories).to.have.length(1);

      // Execute factory to install style.
      const shadowRoot = document.createDocumentFragment();
      extHolder.shadowRootFactories[0](shadowRoot);
      expect(installStylesStub.callCount).to.equal(1);
      expect(installStylesStub.calledWithExactly(
          shadowRoot,
          'a{}',
          /* isRuntimeCss */ false,
          /* ext */ 'amp-ext')).to.be.true;

      // Service and extensions are resolved.
      return Promise.all([
        extensions.waitForExtension('amp-ext'),
        servicePromise]);
    });

    it('should register doc-service as ctor and defer install', () => {
      class Service1 {}
      win.AMP.push({
        n: 'amp-ext',
        f: amp => {
          amp.registerServiceForDoc('service1', Service1);
        },
      });

      // Factory recorded.
      const extHolder = extensions.extensions_['amp-ext'];
      expect(extHolder.docFactories).to.have.length(1);

      const shadowRoot = document.createDocumentFragment();
      const ampdoc = new AmpDocShadow(win, 'https://a.org/', shadowRoot);

      // Not installed.
      expect(getServicePromiseOrNullForDoc(ampdoc, 'service1')).to.be.null;

      // Install.
      extHolder.docFactories[0](ampdoc);
      expect(getServiceForDoc(ampdoc, 'service1')).to.be.instanceOf(Service1);
    });
  });
});


describes.realWin('runtime multidoc', {
  amp: {ampdoc: 'multi'},
}, env => {
  let win;
  let extensions;
  let extensionsMock;
  let ampdocServiceMock;

  beforeEach(() => {
    win = env.win;
    extensions = env.extensions;
    extensionsMock = sandbox.mock(extensions);
    ampdocServiceMock = sandbox.mock(env.ampdocService);
  });

  afterEach(() => {
    extensionsMock.verify();
    ampdocServiceMock.verify();
  });

  describe('attachShadowDoc', () => {
    const docUrl = 'https://example.org/doc1';

    let clock;
    let importDoc;
    let hostElement;
    let ampdoc;

    beforeEach(() => {
      clock = sandbox.useFakeTimers();
      hostElement = win.document.createElement('div');
      importDoc = win.document.implementation.createHTMLDocument('');
      importDoc.body.appendChild(win.document.createElement('child'));
      ampdoc = new AmpDocShadow(win, docUrl, win.document.createElement('div'));

      ampdocServiceMock.expects('installShadowDoc_')
          .withExactArgs(
              docUrl,
              sinon.match(arg => arg == hostElement.shadowRoot))
          .returns(ampdoc)
          .atLeast(0);
      ampdocServiceMock.expects('getAmpDoc')
          .withExactArgs(sinon.match(arg => arg == hostElement.shadowRoot))
          .returns(ampdoc)
          .atLeast(0);
    });

    it('should install services and styles', () => {
      const ret = win.AMP.attachShadowDoc(hostElement, importDoc, docUrl);
      expect(ret).to.exist;

      const shadowRoot = hostElement.shadowRoot;

      // URL is set.
      expect(shadowRoot.AMP.url).to.equal(docUrl);

      // Stylesheet has been installed.
      expect(shadowRoot.querySelector('style[amp-runtime]')).to.exist;

      // Doc services have been installed.
      expect(ampdoc.services.action).to.exist;
      expect(ampdoc.services.action.obj).to.exist;
      expect(ampdoc.services.viewer).to.exist;
      expect(ampdoc.services.viewer.obj).to.exist;

      // Single-doc bidings have been installed.
      expect(ret.viewer).to.exist;
      expect(ret.viewer.ampdoc).to.equal(ampdoc);
    });

    it('should install doc services', () => {
      class Service1 {}
      win.AMP.push({
        n: 'amp-ext',
        f: amp => {
          amp.registerServiceForDoc('service1', Service1);
        },
      });

      const script = win.document.createElement('script');
      script.setAttribute('custom-element', 'amp-ext');
      script.setAttribute('src', '');
      importDoc.head.appendChild(script);

      win.AMP.attachShadowDoc(hostElement, importDoc, docUrl);

      return extensions.waitForExtension('amp-ext').then(() => {
        // Factories have been applied.
        expect(getServiceForDoc(ampdoc, 'service1')).to.be.instanceOf(Service1);
      });
    });

    it('should pass init parameters to viewer', () => {
      const amp = win.AMP.attachShadowDoc(hostElement, importDoc, docUrl, {
        'test1': '12',
      });

      expect(amp.viewer).to.equal(getServiceForDoc(ampdoc, 'viewer'));
      expect(amp.viewer.getParam('test1')).to.equal('12');
    });

    it('should update host visibility', () => {
      win.AMP.attachShadowDoc(hostElement, importDoc, docUrl);

      // Document is invisible at first.
      expect(hostElement.style.visibility).to.equal('hidden');

      // After timeout, it becomes visible again.
      clock.tick(3000);
      expect(hostElement.style.visibility).to.equal('visible');

      return ampdoc.whenReady().then(() => {
        expect(ampdoc.isReady()).to.be.true;
      });
    });

    it('should import body', () => {
      win.AMP.attachShadowDoc(hostElement, importDoc, docUrl);
      const shadowRoot = hostElement.shadowRoot;
      const body = shadowRoot.querySelector('body') ||
          shadowRoot.querySelector('amp-body');
      expect(body).to.exist;
      expect(body).to.have.class('amp-shadow');
      expect(body.style.position).to.equal('relative');
      expect(body.querySelector('child')).to.exist;
      expect(ampdoc.getBody()).to.exist;
    });

    it('should read title element', () => {
      const titleEl = win.document.createElement('title');
      titleEl.textContent = 'test title';
      importDoc.head.appendChild(titleEl);
      const ret = win.AMP.attachShadowDoc(hostElement, importDoc, docUrl);
      expect(ret.title).to.equal('test title');
      expect(hostElement.shadowRoot.AMP.title).to.equal('test title');
    });

    it('should read canonical element', () => {
      const canonicalEl = win.document.createElement('link');
      canonicalEl.setAttribute('rel', 'canonical');
      canonicalEl.setAttribute('href', 'http://example.org/canonical');
      importDoc.head.appendChild(canonicalEl);
      const ret = win.AMP.attachShadowDoc(hostElement, importDoc, docUrl);
      expect(ret.canonicalUrl).to.equal('http://example.org/canonical');
    });

    it('should import fonts', () => {
      const fontEl1 = win.document.createElement('link');
      fontEl1.setAttribute('rel', 'stylesheet');
      fontEl1.setAttribute('href', 'http://example.org/font1');
      importDoc.head.appendChild(fontEl1);
      const fontEl2 = win.document.createElement('link');
      fontEl2.setAttribute('rel', 'stylesheet');
      fontEl2.setAttribute('href', 'http://example.org/font2');
      importDoc.head.appendChild(fontEl2);
      win.document.head.appendChild(fontEl2.cloneNode(true));
      win.AMP.attachShadowDoc(hostElement, importDoc, docUrl);
      expect(win.document.querySelector(
          'link[href="http://example.org/font1"]')).to.exist;
      // Duplicates are ignored.
      expect(win.document.querySelectorAll(
          'link[href="http://example.org/font2"]')).to.have.length(1);

      const fontEl = win.document.querySelector(
          'link[href="http://example.org/font1"]');
      expect(fontEl.getAttribute('type')).to.equal('text/css');
      expect(fontEl.getAttribute('rel')).to.equal('stylesheet');
      fontEl.parentElement.removeChild(fontEl);
    });

    it('should ignore boilerplate style', () => {
      const styleEl = win.document.createElement('style');
      styleEl.setAttribute('amp-boilerplate', '');
      importDoc.head.appendChild(styleEl);
      win.AMP.attachShadowDoc(hostElement, importDoc, docUrl);
      const shadowRoot = hostElement.shadowRoot;
      expect(shadowRoot.querySelector('style[amp-boilerplate]')).to.not.exist;
    });

    it('should import custom style', () => {
      const styleEl = win.document.createElement('style');
      styleEl.setAttribute('amp-custom', '');
      styleEl.textContent = '/*custom*/';
      importDoc.head.appendChild(styleEl);
      win.AMP.attachShadowDoc(hostElement, importDoc, docUrl);
      const shadowRoot = hostElement.shadowRoot;
      expect(shadowRoot.querySelector('style[amp-custom]')).to.exist;
      expect(shadowRoot.querySelector('style[amp-custom]').textContent)
          .to.equal('/*custom*/');
    });

    it('should ignore runtime extension', () => {
      extensionsMock.expects('loadExtension').never();

      const scriptEl = win.document.createElement('script');
      scriptEl.setAttribute('src', 'https://cdn.ampproject.org/v0.js');
      importDoc.head.appendChild(scriptEl);
      win.AMP.attachShadowDoc(hostElement, importDoc, docUrl);
    });

    it('should ignore unknown script', () => {
      extensionsMock.expects('loadExtension').never();

      const scriptEl = win.document.createElement('script');
      scriptEl.setAttribute('data-id', 'unknown1');
      scriptEl.setAttribute('src', 'https://cdn.ampproject.org/other.js');
      importDoc.head.appendChild(scriptEl);
      win.AMP.attachShadowDoc(hostElement, importDoc, docUrl);
      expect(hostElement.shadowRoot.querySelector('script[data-id="unknown1"]'))
          .to.not.exist;
      expect(win.document.querySelector('script[data-id="unknown1"]'))
          .to.not.exist;
    });

    it('should import extension element', () => {
      extensionsMock.expects('loadExtension')
          .withExactArgs('amp-ext1')
          .returns(Promise.resolve({
            elements: {
              'amp-ext1': function() {},
            },
          }))
          .once();

      const scriptEl = win.document.createElement('script');
      scriptEl.setAttribute('custom-element', 'amp-ext1');
      scriptEl.setAttribute('src', '');
      importDoc.head.appendChild(scriptEl);
      win.AMP.attachShadowDoc(hostElement, importDoc, docUrl);
      expect(win.document.querySelector('script[custom-element="amp-ext1"]'))
          .to.not.exist;
    });

    it('should import extension template', () => {
      extensionsMock.expects('loadExtension')
          .withExactArgs('amp-ext1')
          .returns(Promise.resolve({elements: {}}))
          .once();

      const scriptEl = win.document.createElement('script');
      scriptEl.setAttribute('custom-template', 'amp-ext1');
      scriptEl.setAttribute('src', '');
      importDoc.head.appendChild(scriptEl);
      win.AMP.attachShadowDoc(hostElement, importDoc, docUrl);
      expect(win.document.querySelector('script[custom-template="amp-ext1"]'))
          .to.not.exist;
    });

    it('should import inline script', () => {
      const scriptEl = win.document.createElement('script');
      scriptEl.setAttribute('type', 'application/json');
      scriptEl.setAttribute('data-id', 'test1');
      scriptEl.textContent = '{}';
      importDoc.head.appendChild(scriptEl);
      win.AMP.attachShadowDoc(hostElement, importDoc, docUrl);
      expect(hostElement.shadowRoot.querySelector('script[data-id="test1"]'))
          .to.exist;
      expect(hostElement.shadowRoot.querySelector(
          'script[data-id="test1"]').textContent).to.equal('{}');
    });

    it('should ignore inline script if javascript', () => {
      const scriptEl1 = win.document.createElement('script');
      scriptEl1.setAttribute('type', 'application/javascript');
      scriptEl1.setAttribute('data-id', 'test1');
      importDoc.head.appendChild(scriptEl1);
      const scriptEl2 = win.document.createElement('script');
      scriptEl2.setAttribute('data-id', 'test1');
      importDoc.head.appendChild(scriptEl2);
      win.AMP.attachShadowDoc(hostElement, importDoc, docUrl);
      expect(hostElement.shadowRoot.querySelector('script[data-id="test1"]'))
          .to.not.exist;
    });

    it('should start as visible by default', () => {
      const amp = win.AMP.attachShadowDoc(hostElement, importDoc, docUrl);
      expect(amp.viewer.getVisibilityState()).to.equal('visible');
    });

    it('should start as prerender when requested', () => {
      const amp = win.AMP.attachShadowDoc(hostElement, importDoc, docUrl, {
        'visibilityState': 'prerender',
      });
      expect(amp.viewer.getVisibilityState()).to.equal('prerender');
    });

    it('should expose visibility method', () => {
      const amp = win.AMP.attachShadowDoc(hostElement, importDoc, docUrl);
      expect(amp.setVisibilityState).to.be.function;
      expect(amp.viewer.getVisibilityState()).to.equal('visible');

      amp.setVisibilityState('inactive');
      expect(amp.viewer.getVisibilityState()).to.equal('inactive');
    });

    it('should expose close method and dispose services', () => {
      const amp = win.AMP.attachShadowDoc(hostElement, importDoc, docUrl);
      expect(amp.close).to.be.function;
      expect(amp.viewer.getVisibilityState()).to.equal('visible');

      amp.viewer.dispose = sandbox.spy();
      amp.close();
      expect(amp.viewer.getVisibilityState()).to.equal('inactive');
      expect(amp.viewer.dispose).to.be.calledOnce;
    });
  });
});
