// About, Contact, Privacy and Terms pages (editsupreme.com/about/ …), made at build time by
// scripts/seo-pages.mjs. `html` is the page's text; keep it accurate to what the site really does.
export const CONTACT_EMAIL = 'editsupremesupport@gmail.com';
export const UPDATED = '17 November 2026';

const mail = `<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>`;

export const INFO_PAGES = [
  {
    slug: 'about',
    t: 'About EditSupreme – Free, Private PDF and Image Tools',
    d: 'EditSupreme is a free set of PDF, image, design and AI tools that run in your browser, so your files never leave your device.',
    h: 'About EditSupreme',
    html: `
<p class="seolead">EditSupreme is a free set of PDF, image, design and AI tools that work right in your web browser. Edit, merge, compress, convert, sign and protect PDFs; resize and convert photos; remove backgrounds, make passport photos and design social media posts, all in one place.</p>
<h3>Why we made it</h3>
<p>Most online PDF and image tools upload your files to their servers. Your documents are often private: ID cards, bank statements, contracts, resumes, photos. EditSupreme works differently: the tools run on your own phone or computer, so your files are processed on your device and are never uploaded to us.</p>
<h3>What makes it different</h3>
<ul>
  <li><b>Private by design:</b> files stay on your device, even the AI features, which run on your device too.</li>
  <li><b>Free:</b> no sign-up, no watermarks and no daily limits.</li>
  <li><b>Works anywhere:</b> on phones, tablets and computers, in any modern browser. Install it as an app and most tools keep working offline.</li>
  <li><b>Everything in one place:</b> PDF tools, image tools, a design studio, creative apps for photo, video and audio, and an AI assistant you can talk to.</li>
</ul>
<h3>How it is paid for</h3>
<p>EditSupreme is free to use. To cover hosting and development we may show advertising on the site; ads never get access to your files. See our <a href="/privacy/">Privacy Policy</a> for details.</p>
<h3>Get in touch</h3>
<p>Ideas, problems or questions? We would love to hear from you: ${mail}, or see the <a href="/contact/">Contact page</a>.</p>`
  },
  {
    slug: 'contact',
    t: 'Contact EditSupreme',
    d: 'Contact the EditSupreme team with questions, problems, ideas for new tools or business enquiries.',
    h: 'Contact us',
    html: `
<p class="seolead">Questions, problems, ideas for new tools, or business and advertising enquiries: email us and we will get back to you as soon as we can.</p>
<p class="contactmail">${mail}</p>
<h3>Reporting a problem</h3>
<p>It helps us a lot if you tell us:</p>
<ul>
  <li>which tool you used, for example “Compress PDF”;</li>
  <li>your device and browser, for example “Android phone, Chrome”;</li>
  <li>what you expected to happen and what happened instead.</li>
</ul>
<p>Please do <b>not</b> send private documents unless we ask for a sample and you are happy to share it. Because your files never reach our servers, we cannot see them or recover them for you.</p>
<h3>Privacy questions</h3>
<p>For questions about your data, see the <a href="/privacy/">Privacy Policy</a> or write to the email address above.</p>`
  },
  {
    slug: 'privacy',
    t: 'Privacy Policy – EditSupreme',
    d: 'How EditSupreme handles your data: files are processed on your device and never uploaded. Details on cookies, analytics and advertising.',
    h: 'Privacy Policy',
    html: `
<p class="seomuted">Last updated: ${UPDATED}</p>
<p class="seolead">In short: the files you open in EditSupreme are processed on your own device and are not uploaded to us. We use cookies for analytics and, where shown, advertising. This policy explains the details.</p>

<h3>1. Your files</h3>
<p>When you use a tool on editsupreme.com (“EditSupreme”, “we”, “us”), your PDFs, images, audio and other files are opened and processed by your web browser on your own device. They are not uploaded to our servers, and we do not store, view or share them. The AI features (such as background removal, speech to text, object selection and passport photos) also run on your device.</p>

<h3>2. When the site connects to other services</h3>
<p>Some features need to download something or look something up. In these cases your browser connects to another service, which can see your IP address and browser details as with any website visit:</p>
<ul>
  <li><b>AI models and software libraries</b> are downloaded from Hugging Face, jsDelivr and Google (MediaPipe). Only the models are downloaded; your files are not sent.</li>
  <li><b>Fonts and icons</b> are loaded from Google Fonts, Fontsource and Iconify.</li>
  <li><b>Text recognition (OCR) languages</b> are downloaded the first time you use a language.</li>
  <li><b>Stock photo search</b> in Design Studio: the words you search for are sent to our server and to Pexels, Unsplash, Pixabay, Openverse and Wikimedia Commons to find pictures.</li>
  <li><b>Converting a web address</b> (HTML to PDF or image): your browser loads the page at the address you type.</li>
  <li><b>Voice input</b> for the AI assistant uses your browser’s built-in speech recognition. In some browsers, such as Google Chrome, the audio is sent to the browser maker’s speech service to turn it into text. Typing instead of speaking avoids this. (The “Audio to text” tool is different: it runs on your device.)</li>
</ul>

<h3>3. Information stored on your device</h3>
<p>To remember your settings and make the site work offline, EditSupreme stores some information in your browser (local storage, IndexedDB and cache), for example your light or dark theme, saved workflows, brand kit, designs you save, and downloaded AI models. This stays on your device. You can remove it at any time by clearing this site’s data in your browser settings.</p>

<h3>4. Analytics</h3>
<p>We use Google Tag Manager and Google Analytics to understand how the site is used, for example how many people visit, which tools are popular, the type of device and the approximate country. This uses cookies and similar technologies. It does not include the content of your files. Learn how Google uses this information: <a href="https://policies.google.com/technologies/partner-sites" rel="noopener" target="_blank">How Google uses information from sites that use its services</a>.</p>

<h3>5. Advertising</h3>
<p>We may show advertising to keep EditSupreme free. Ads may be provided by Google (Google AdSense) and other advertising partners.</p>
<ul>
  <li>Third-party vendors, including Google, use cookies to serve ads based on your previous visits to this website or other websites.</li>
  <li>Google’s use of advertising cookies enables it and its partners to serve ads to you based on your visits to this site and/or other sites on the internet.</li>
  <li>You can opt out of personalised advertising by visiting <a href="https://adssettings.google.com" rel="noopener" target="_blank">Google Ads Settings</a>, or opt out of some third-party vendors’ use of cookies at <a href="https://www.aboutads.info/choices/" rel="noopener" target="_blank">aboutads.info</a>.</li>
</ul>
<p>Advertisers never get access to your files.</p>

<h3>6. Cookies and your choices</h3>
<p>Visitors in the European Economic Area, the United Kingdom and Switzerland are asked for their consent before cookies are used for personalised advertising, and can change their choice later. Anyone can block or delete cookies in their browser settings; the tools keep working without them.</p>

<h3>7. Server logs</h3>
<p>Like most websites, our hosting provider automatically records basic technical information when pages are requested (such as IP address, browser type, the page requested and the time) to keep the site secure and working. These logs are kept only for a limited time.</p>

<h3>8. Children</h3>
<p>EditSupreme is not directed at children under 13, and we do not knowingly collect personal information from them.</p>

<h3>9. Your rights</h3>
<p>Depending on where you live (for example under the GDPR in Europe, India’s Digital Personal Data Protection Act, or California law), you may have the right to ask what personal data we hold about you, to correct or delete it, or to object to its use. As we do not ask you to create an account and do not receive your files, we hold very little personal data. To make a request, contact us at the address below.</p>

<h3>10. Changes to this policy</h3>
<p>We may update this policy as the site changes. The date at the top shows when it was last updated.</p>

<h3>11. Contact</h3>
<p>Questions about this policy: ${mail}.</p>`
  },
  {
    slug: 'terms',
    t: 'Terms of Use – EditSupreme',
    d: 'The terms for using EditSupreme’s free PDF, image, design and AI tools.',
    h: 'Terms of Use',
    html: `
<p class="seomuted">Last updated: ${UPDATED}</p>
<p class="seolead">By using editsupreme.com (“EditSupreme”, “we”, “us”) you agree to these terms. If you do not agree, please do not use the site.</p>

<h3>1. The service</h3>
<p>EditSupreme provides free online tools for working with PDFs, images, designs, audio and video. The tools run in your web browser. We may add, change or remove tools at any time.</p>

<h3>2. Your files and your responsibility</h3>
<ul>
  <li>Your files stay yours. Because they are processed on your device, you are responsible for keeping copies of your originals and downloading your results.</li>
  <li>Only use files you have the right to use. Do not use EditSupreme to infringe copyright or other rights, or to open, unlock or change documents you are not allowed to.</li>
  <li>Do not use the site for anything illegal, harmful or misleading, such as forging documents, signatures or identity papers.</li>
</ul>

<h3>3. Results and AI features</h3>
<p>We work hard to make the tools accurate, but results are not guaranteed. Text recognition, translation, summaries, transcriptions, AI cut-outs and similar features can make mistakes. Please check important results before you rely on them. Passport and visa photos are made to the published size rules, but acceptance is decided by the authority you submit them to.</p>

<h3>4. Third-party content</h3>
<p>Stock photos, fonts and icons offered in Design Studio come from third parties (such as Pexels, Unsplash, Pixabay, Openverse, Wikimedia Commons, Google Fonts and Iconify) and are subject to their own licences. Please check the licence before using them, especially for commercial work.</p>

<h3>5. Advertising</h3>
<p>The site may show advertising. Ads are provided by third parties, and we are not responsible for the products or websites they link to.</p>

<h3>6. No warranty</h3>
<p>EditSupreme is provided free of charge, “as is” and “as available”, without warranties of any kind. We do not promise that the site will always be available, error-free or suitable for a particular purpose.</p>

<h3>7. Limitation of liability</h3>
<p>To the fullest extent allowed by law, we are not liable for any loss of data, files, profits or other indirect or consequential losses arising from your use of the site.</p>

<h3>8. Changes</h3>
<p>We may update these terms from time to time. The date at the top shows the latest version. Continuing to use the site means you accept the updated terms.</p>

<h3>9. Governing law</h3>
<p>These terms are governed by the laws of India.</p>

<h3>10. Contact</h3>
<p>Questions about these terms: ${mail}.</p>`
  }
];
