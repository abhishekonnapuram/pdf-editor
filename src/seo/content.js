// What search engines (and visitors) read on each tool's own page: title, description, an introduction,
// the steps and common questions. Turned into editsupreme.com/<slug>/ pages at build time (vite.config.js).
// t: page title (under ~60 characters), d: description (under ~155), i: introduction, s: steps (optional),
// q: questions and answers.
export const CONTENT = {
  'assistant': {
    t: 'AI Assistant for PDFs and Images – Free, by Voice or Text',
    d: 'Say or type what you need, like “compress this PDF under 1 MB” or “remove the background”, and the free AI assistant runs the right tools on your files.',
    i: 'Not sure which tool you need? Tell the EditSupreme AI assistant in your own words, by typing or speaking, in English or Hinglish. It picks the right tools and runs them on your files, one step after another, right in your browser.',
    s: ['Add your files, or start without them.', 'Type or say what you want, for example “make this photo 600 × 600 with a white background”.', 'Check the result and download it, or ask for another change.'],
    q: [['What can I ask it to do?', 'Anything the site’s tools can do: compress, convert, merge, split, resize, crop, remove backgrounds, sign, protect and more, including several steps in one request.'],
      ['Does it understand Hindi or Hinglish?', 'Yes. Everyday phrases such as “is PDF ko chhota karo” are understood, as well as plain English.']]
  },
  'passport-photo': {
    t: 'Passport Size Photo Maker Online – Free (India, US, UK, Visa)',
    d: 'Make passport, visa and ID photos for India, USA, UK, Schengen, Canada and more. AI finds your face, sets a white background and sizes it to the rules.',
    i: 'Take a photo against any wall and turn it into a correct passport size photo in seconds. The AI finds your face, replaces the background, and sizes your head to the official rules for the country you choose. You can download a single photo for online forms or a print sheet with several copies.',
    s: ['Choose a clear, front-facing photo of yourself.', 'Pick the country and document (passport, visa, OCI, PAN card and more).', 'Download the photo for online applications, or the print sheet for a photo shop.'],
    q: [['What is the Indian passport photo size?', 'For an Indian passport the photo is 35 × 45 mm on a plain white background, with the face clearly visible. Choose “India passport” and the tool sets this for you; India visa and OCI photos use 2 × 2 inches.'],
      ['Can I get a print sheet with several photos?', 'Yes. Download a 4 × 6 inch, 5 × 7 inch, A4 or Letter sheet with several copies and print it at any photo shop or at home.'],
      ['Is my photo uploaded anywhere?', 'No. The face detection and background removal run on your own device.']]
  },
  'audio-to-text': {
    t: 'Audio to Text Converter – Free Transcription & Subtitles',
    d: 'Turn speech in audio and video files into text or SRT/VTT subtitles in 20+ languages with Whisper AI, free and on your own device.',
    i: 'Transcribe interviews, lectures, voice notes, podcasts and videos into text. EditSupreme uses the Whisper speech-recognition AI, running on your own device, and can also make SRT or VTT subtitle files with timings.',
    q: [['Which files can I use?', 'Most audio and video files your browser can play, such as MP3, WAV, M4A, OGG, MP4 and WEBM.'],
      ['Which languages are supported?', 'More than 20, including English, Hindi, Spanish, French, German, Arabic and Chinese.']]
  },
  'chat-pdf': {
    t: 'Chat with PDF – Ask Questions About Any PDF, Free',
    d: 'Ask questions about a PDF by typing or speaking and get answers with the page they come from. Free and private: the PDF stays on your device.',
    i: 'Find answers in long PDFs without reading them page by page. Ask a question in plain words and EditSupreme shows the answer with the page it comes from, so you can check it. Handy for reports, manuals, study notes and contracts.',
    q: [['Is my PDF uploaded to a server?', 'No. The PDF is read and searched on your own device.'],
      ['Can I ask by voice?', 'Yes. Tap the microphone and speak your question.']]
  },
  'creative-apps': {
    t: 'Free Creative Apps in Your Browser – Photo, Video, Audio',
    d: 'Free creative apps that run in your browser: a layered photo editor, vector art, RAW developing, video editing, motion graphics and an audio workstation.',
    i: 'A full creative suite with no installation and no subscription. Edit photos with layers and masks, draw vector logos, develop RAW photos, cut videos, animate titles and record music, all in your web browser.',
    q: [['Do I need to install anything?', 'No. The apps open in your browser and can be installed as apps if you like.'],
      ['Are they really free?', 'Yes, every app is free to use with no watermarks.']]
  },
  'photo-studio': {
    t: 'Online Photo Editor with Layers – Free, Opens PSD Files',
    d: 'A full photo editor in your browser: layers, masks, adjustment layers, filters, layer styles, text, brushes and PSD files. Free, no install.',
    i: 'Photo Studio (PhotoCraft) is a complete layer-based photo editor that runs in your browser. Work with layers, masks, adjustment layers, filters, layer styles, type and brushes, and open or save PSD files.',
    q: [['Can it open Photoshop (PSD) files?', 'Yes. PSD files open with their layers, and you can save your work as PSD again.'],
      ['Does it work offline?', 'After the first visit it is kept on your device and keeps working without internet.']]
  },
  'vectorcraft': {
    t: 'Free Vector Editor Online – Logos, Icons, SVG',
    d: 'Design logos, icons and illustrations in your browser with paths, shapes, gradients and type. Export SVG and more. Free vector graphics editor.',
    i: 'VectorCraft is a vector graphics editor for logos, icons and illustrations. Draw with the pen tool, combine shapes, add gradients and text, and export sharp SVG files that scale to any size.',
    q: [['Can I export SVG?', 'Yes, along with PNG and other common formats.'],
      ['Is it good for logos?', 'Yes. Vector shapes stay crisp at any size, from a favicon to a banner.']]
  },
  'lightcraft': {
    t: 'RAW Photo Editor Online – Free Non-Destructive Editing',
    d: 'Develop RAW and JPG photos in your browser: exposure, colour, tone curves and presets, without changing the original. Free online RAW editor.',
    i: 'LightCraft develops your photos without touching the original file. Adjust exposure, white balance, colour and tone curves, apply presets, and export when you are happy. RAW camera files and JPGs are supported.',
    q: [['Which camera RAW files work?', 'Common RAW formats from most major camera makers, as well as JPG and PNG.'],
      ['Is the original changed?', 'No. Edits are saved as settings, so you can always go back.']]
  },
  'filmcraft': {
    t: 'Free Online Video Editor – Timeline, Titles, Transitions',
    d: 'Edit videos in your browser with a multi-track timeline: cut, trim, add titles, transitions and music. Free, no watermark, no upload.',
    i: 'FilmCraft is a video editor with a multi-track timeline that runs in your browser. Cut and trim clips, add titles and transitions, mix in music and voice, and export your video without a watermark.',
    q: [['Is there a watermark?', 'No. Exported videos are clean.'],
      ['Are my videos uploaded?', 'No. Editing and exporting happen on your device.']]
  },
  'effectcraft': {
    t: 'Motion Graphics Editor Online – Animated Text & Effects',
    d: 'Create motion graphics in your browser: animated text, shapes, keyframes, layers and effects for intros, reels and titles. Free.',
    i: 'EffectCraft is for motion graphics and compositing. Animate text and shapes with keyframes, layer effects, and make intros, lower thirds and social media animations right in your browser.',
    q: [['What can I make with it?', 'Animated titles, logo reveals, intros, lower thirds and short animated posts.'],
      ['Does it need a powerful computer?', 'It runs in any modern browser; bigger projects are smoother on faster computers.']]
  },
  'soundcraft': {
    t: 'Free Online Audio Editor & Recorder (DAW)',
    d: 'Record, arrange, mix and edit music, voice-overs and podcasts in your browser with a multi-track audio workstation. Free, no install.',
    i: 'SoundCraft is a digital audio workstation in your browser. Record your voice or instruments, arrange tracks on a timeline, cut and mix, and export finished audio for podcasts, voice-overs and music.',
    q: [['Can I record from my microphone?', 'Yes. Allow microphone access and record straight onto a track.'],
      ['Do I need to install anything?', 'No. It runs in your browser and keeps working offline after the first visit.']]
  },
  'pdfcraft': {
    t: 'PDF Reader and Annotator – Free Online PDF App',
    d: 'Read, annotate, highlight, edit and search PDFs in a full PDF app in your browser, with built-in text recognition. Free and private.',
    i: 'PdfCraft is a complete PDF reader and editor app. Read comfortably, highlight and comment, edit, and search even scanned documents thanks to built-in text recognition.',
    q: [['Can it search scanned PDFs?', 'Yes. Text recognition makes scanned pages searchable.'],
      ['Is it free?', 'Yes, with no sign-up.']]
  },
  'design-studio': {
    t: 'Free Graphic Design Maker – Posts, Thumbnails, Posters',
    d: 'Design Instagram posts, YouTube thumbnails, posters, banners and business cards with free templates, fonts, icons and stock photos. No watermark.',
    i: 'Create social media posts, ads, YouTube thumbnails, banners, posters and business cards. Start from a template or a blank page, add free stock photos, 200,000+ icons and Google Fonts, keep your brand kit, and resize a design for every platform with one click.',
    q: [['Is there a watermark on downloads?', 'No. Download PNG, JPG or PDF without a watermark.'],
      ['Can I turn a picture into an editable design?', 'Yes. Use Image to layers or Screenshot to template to rebuild a picture as editable layers.']]
  },
  'compress-image': {
    t: 'Compress Image – Reduce JPG, PNG Size in KB, Free',
    d: 'Make JPG, PNG, WEBP, GIF and SVG images smaller without losing visible quality, or to an exact size like 20 KB, 50 KB or 100 KB. Free, no upload.',
    i: 'Shrink photos for email, websites and online forms. Choose a quality level, or type the exact size a form asks for (for example under 50 KB) and EditSupreme finds the best quality that fits. Many images can be compressed at once.',
    q: [['Can I compress a photo to exactly 20 KB or 50 KB?', 'Yes. Choose “Exact file size”, type the size in KB, and the tool keeps the image as sharp as possible under that size.'],
      ['Will the image look worse?', 'At the recommended level the difference is hard to see, while the file is much smaller.']]
  },
  'resize-image': {
    t: 'Resize Image Online – Pixels, Percentage or KB, Free',
    d: 'Resize JPG, PNG, WEBP, GIF and SVG images by pixels or percentage, many at once, and keep the file under a size limit. Free and private.',
    i: 'Change the width and height of your images in pixels, centimetres, millimetres or inches, or by percentage. Resize a whole batch at once, keep the proportions, and optionally keep each file under a size limit for online forms.',
    q: [['Can I resize many photos at once?', 'Yes. Add as many images as you like and they are all resized with the same settings.'],
      ['Can I resize and limit the file size?', 'Yes. Tick “Also keep the file under a size” and type the limit in KB or MB.']]
  },
  'crop-image': {
    t: 'Crop Image Online – Free, 1:1, 16:9 or Exact Pixels',
    d: 'Crop JPG, PNG and GIF images with a visual editor or exact pixel sizes, with ready shapes like square 1:1, 4:5 and 16:9. Free, no upload.',
    i: 'Cut away what you don’t need. Drag the crop box, pick a ready shape such as square for profile pictures or 16:9 for thumbnails, or type exact pixel sizes.',
    q: [['Can I crop to a square for a profile picture?', 'Yes. Choose 1:1 and move the box over the part you want.'],
      ['Is the quality kept?', 'Yes. Cropping only removes the outside part; the rest stays as it was.']]
  },
  'convert-to-jpg': {
    t: 'Convert to JPG – PNG, HEIC, WEBP, TIFF, PSD to JPG, Free',
    d: 'Convert PNG, HEIC (iPhone), WEBP, GIF, TIFF, PSD, SVG and camera RAW pictures to JPG, many at once. Free and private.',
    i: 'Turn almost any picture into a JPG that opens everywhere. iPhone HEIC photos, WEBP images from websites, PNG screenshots, TIFF scans and even Photoshop PSD files are converted on your device.',
    q: [['How do I convert iPhone HEIC photos to JPG?', 'Add the HEIC photos and press Convert. They are turned into JPG files you can use anywhere.'],
      ['Can I convert many files at once?', 'Yes, add as many as you need.']]
  },
  'convert-from-jpg': {
    t: 'JPG to PNG, WEBP or GIF Converter – Free',
    d: 'Convert JPG pictures to PNG, WEBP or GIF, or combine several JPGs into an animated GIF. Free, fast and private.',
    i: 'Convert JPG images to PNG for lossless editing, to WEBP for faster websites, or to GIF. You can also put several JPG pictures together into an animated GIF.',
    q: [['How do I make an animated GIF from photos?', 'Add the JPGs in order, choose animated GIF and set the speed.'],
      ['Why convert JPG to WEBP?', 'WEBP files are usually much smaller at the same quality, so web pages load faster.']]
  },
  'photo-editor': {
    t: 'Free Photo Editor Online – Text, Stickers, Frames, Effects',
    d: 'Add text, stickers, frames and effects to your photos in your browser. Quick, free and private photo editing with no sign-up.',
    i: 'Make quick edits without a heavy app: add text, stickers and frames, apply effects and adjust colours, then download your photo.',
    q: [['Do I need an account?', 'No. Open the editor and start straight away.'],
      ['Need layers and masks?', 'Use Photo Studio for full layer-based editing.']]
  },
  'upscale-image': {
    t: 'AI Image Upscaler – Enlarge Photos 2× or 4×, Free',
    d: 'Enlarge JPG and PNG images 2× or 4× with on-device AI that adds detail instead of blur. Free AI upscaler, no upload, no sign-up.',
    i: 'Make small or low-resolution pictures bigger and sharper. The AI upscaler adds believable detail instead of just stretching pixels, so enlarged photos look clean rather than blurry.',
    q: [['How much can I enlarge a photo?', 'Choose 2× or 4× the original width and height.'],
      ['Is the image uploaded?', 'No. The AI model runs on your device; it is downloaded once and then reused.']]
  },
  'remove-background': {
    t: 'Remove Background from Image – Free AI, No Upload',
    d: 'Remove the background from photos of people, products and objects automatically with free on-device AI. Get a transparent PNG or a white background.',
    i: 'Cut out people, products, pets and objects in one click. The AI finds the subject, keeps fine edges like hair, and gives you a transparent PNG, or you can put the subject on a white or coloured background.',
    q: [['Can I get a white background instead of transparent?', 'Yes. Choose a background colour, for example white for product photos and forms.'],
      ['Is it free with full resolution?', 'Yes. There is no credit system and no size-reduced preview.']]
  },
  'watermark-image': {
    t: 'Watermark Image – Add Text or Logo to Photos, Free',
    d: 'Stamp text or your logo over images with font, transparency, rotation and position, or as a repeating pattern. Batch watermark photos for free.',
    i: 'Protect your photos and show your brand. Add a text or logo watermark, set its transparency, rotation and position, or tile it across the whole picture. Many images can be watermarked at once.',
    q: [['Can I use my logo as a watermark?', 'Yes. Upload a PNG logo, ideally with a transparent background.'],
      ['Can I watermark many photos at once?', 'Yes, all images get the same watermark in one go.']]
  },
  'meme-generator': {
    t: 'Meme Generator – Make Memes from Your Own Pictures, Free',
    d: 'Make a meme from any picture with top and bottom text, captions and any font. Free meme maker with no watermark.',
    i: 'Turn any picture into a meme. Add the classic top and bottom text or a caption, choose a font and colour, and download it without a watermark.',
    q: [['Is there a watermark?', 'No.'], ['Can I use any font?', 'Yes, including the classic bold meme font and many Google Fonts.']]
  },
  'rotate-image': {
    t: 'Rotate Image Online – Any Angle, Flip or Mirror, Free',
    d: 'Rotate pictures to any angle by dragging, or by 90°, and flip or mirror them. Straighten tilted photos for free, no upload.',
    i: 'Fix sideways or tilted photos. Turn pictures by 90° with one click, drag to any angle to straighten a horizon, or flip and mirror them.',
    q: [['Can I straighten a slightly tilted photo?', 'Yes. Drag to rotate by small angles until it looks level.'],
      ['Can I mirror a selfie?', 'Yes, use flip horizontal.']]
  },
  'html-to-image': {
    t: 'HTML to Image – Convert HTML to JPG, PNG or SVG, Free',
    d: 'Turn HTML code or an HTML file into a JPG, PNG or SVG picture in your browser. Free HTML to image converter.',
    i: 'Paste HTML or open an HTML file and save it as a picture, useful for sharing designs, emails and snippets as images.',
    q: [['Which formats can I save?', 'JPG, PNG and SVG.'], ['Does CSS styling work?', 'Yes, styles in the HTML are kept.']]
  },
  'blur-face': {
    t: 'Blur Faces in Photos Automatically – Free and Private',
    d: 'Blur faces in photos automatically with on-device AI, and hide number plates or other private details. Free, no upload.',
    i: 'Protect people’s privacy before you share a photo. Faces are found and blurred automatically, and you can blur any other area, such as number plates, addresses or screens.',
    q: [['Are faces found automatically?', 'Yes. The face detector marks every face; you can add or remove areas yourself.'],
      ['Is the photo uploaded?', 'No. Detection and blurring happen on your device.']]
  },
  'merge': {
    t: 'Merge PDF – Combine PDF Files Online Free',
    d: 'Combine several PDF files into one, in the order you want. Drag to reorder, then merge. Free, no sign-up, and files never leave your device.',
    i: 'Put several PDFs together into one file. Add your PDFs, drag them into the right order, and merge them in seconds. There is no file limit and nothing is uploaded.',
    q: [['Is there a limit on how many PDFs I can merge?', 'No fixed limit. Very large files depend on your device’s memory.'],
      ['Can I change the order before merging?', 'Yes. Drag the files into the order you want.']]
  },
  'split': {
    t: 'Split PDF – Separate PDF Pages Online Free',
    d: 'Split a PDF by page ranges, every N pages, or pull out just the pages you need. Free, fast and private PDF splitter.',
    i: 'Break a large PDF into smaller files. Split by page ranges such as 1–3 and 4–10, every few pages, or save each page as its own PDF.',
    q: [['Can I save each page as a separate PDF?', 'Yes. Choose to split every 1 page.'],
      ['Is the quality changed?', 'No. Pages are copied as they are.']]
  },
  'compress': {
    t: 'Compress PDF – Reduce PDF Size to 100 KB, 200 KB or 1 MB',
    d: 'Reduce PDF file size with a choice of quality, or to an exact size like 100 KB, 200 KB or 1 MB for online forms. Free, no upload.',
    i: 'Make PDFs small enough for email and online applications. Choose a compression level and see the before and after size, or type the exact size a form asks for and EditSupreme shrinks the PDF to fit.',
    q: [['How do I compress a PDF to under 100 KB?', 'Choose “Exact file size”, type 100 and pick KB. The tool shrinks the pictures in the PDF until it fits.'],
      ['Will the text stay sharp?', 'Yes. Text stays as text; mostly the pictures are made smaller. Only if you allow it are pages turned into images to reach a very small size.']]
  },
  'pdf-to-word': {
    t: 'PDF to Word Converter – Editable DOCX, Free',
    d: 'Convert PDF to an editable Word (DOCX) document with text, headings and images kept. Free PDF to Word converter, no upload.',
    i: 'Turn a PDF into a Word document you can edit. Text, headings and images are carried over into a DOCX file that opens in Microsoft Word, Google Docs and LibreOffice.',
    q: [['Can scanned PDFs be converted to Word?', 'Yes, with Image to editable, which reads the text in scans first.'],
      ['Does it work on a phone?', 'Yes, in any modern mobile browser.']]
  },
  'pdf-to-ppt': {
    t: 'PDF to PowerPoint – Convert PDF to PPTX Free',
    d: 'Turn each PDF page into a PowerPoint slide, with the page text in the speaker notes. Free PDF to PPTX converter.',
    i: 'Present a PDF as slides. Each page becomes a PowerPoint slide, and the text from the page is added to the notes so you can reuse it.',
    q: [['Does it open in Google Slides?', 'Yes. The PPTX file works in PowerPoint, Google Slides and Keynote.'],
      ['Is every page converted?', 'Yes, one slide per page.']]
  },
  'pdf-to-excel': {
    t: 'PDF to Excel – Extract Tables to XLSX Free',
    d: 'Pull tables and rows of text from a PDF straight into an Excel spreadsheet (XLSX). Free PDF to Excel converter, private.',
    i: 'Stop copying numbers by hand. Tables and rows of text in your PDF are placed into the cells of an Excel spreadsheet, ready to sort, sum and chart.',
    q: [['Will the columns line up?', 'Text is placed into columns by its position on the page, which works well for most statements and reports.'],
      ['Can I open it in Google Sheets?', 'Yes, the XLSX file opens in Excel and Google Sheets.']]
  },
  'word-to-pdf': {
    t: 'Word to PDF Converter – DOCX to PDF Free',
    d: 'Convert Word documents (DOCX) to PDF online for free. Fast, private and no sign-up needed.',
    i: 'Turn a Word document into a PDF that looks the same on every device, ready to share, print or upload.',
    q: [['Do I need Microsoft Word?', 'No. The conversion happens in your browser.'], ['Which files are supported?', 'DOCX files.']]
  },
  'ppt-to-pdf': {
    t: 'PowerPoint to PDF – PPTX to PDF Free',
    d: 'Convert PowerPoint slides (PPTX) with their text and pictures to PDF. Free and private, no upload.',
    i: 'Share your presentation as a PDF anyone can open. Each slide, with its text and pictures, becomes a PDF page.',
    q: [['Do animations carry over?', 'No. A PDF shows each slide as a still page.'], ['Is it free?', 'Yes.']]
  },
  'excel-to-pdf': {
    t: 'Excel to PDF – Convert XLSX and CSV to PDF Free',
    d: 'Convert Excel (XLSX) and CSV spreadsheets to readable PDF pages. Free and private Excel to PDF converter.',
    i: 'Turn spreadsheets into neat PDF pages for sharing and printing, from Excel workbooks or CSV files.',
    q: [['Can I convert CSV files?', 'Yes, CSV and XLSX are both supported.'], ['Is my data uploaded?', 'No, it stays on your device.']]
  },
  'edit': {
    t: 'Edit PDF Online Free – Change Text, Images, Scans',
    d: 'Edit existing PDF text, images and even words inside scanned pages. Add text, images, shapes and drawings. Free PDF editor, no upload.',
    i: 'Change a PDF as easily as a document. Click any text to edit it in a matching font, replace or move images, and even change words inside scanned pages and pictures. Add new text, images, shapes, highlights and drawings too.',
    q: [['Can I edit the text in a scanned PDF?', 'Yes. Text in scans and pictures is recognised and can be changed so it blends in.'],
      ['Will the formatting stay the same?', 'Edited text uses the closest matching font, size and colour.'],
      ['Is there a watermark?', 'No.']]
  },
  'pdf-to-jpg': {
    t: 'PDF to JPG – Convert PDF Pages to Images Free',
    d: 'Save every PDF page as a JPG or PNG image, or extract all images inside the PDF. Free, high quality and private.',
    i: 'Turn PDF pages into pictures for sharing, slides or social media, at the quality you choose. You can also pull out every image embedded in a PDF.',
    q: [['Can I choose the image quality?', 'Yes. Pick a higher resolution for printing or a smaller one for sharing.'],
      ['Can I get PNG instead of JPG?', 'Yes.']]
  },
  'jpg-to-pdf': {
    t: 'JPG to PDF – Convert Images to PDF Free',
    d: 'Turn JPG, PNG, WEBP and iPhone HEIC images into one PDF with your choice of page size, orientation and margins. Free and private.',
    i: 'Combine photos or scanned pages into a single PDF. Arrange them in order, pick A4 or Letter, portrait or landscape, and set margins.',
    q: [['Can I combine many photos into one PDF?', 'Yes. Add them all and drag them into order.'],
      ['Which page sizes are available?', 'A4, Letter, fit to image and more.']]
  },
  'sign': {
    t: 'Sign PDF Online Free – Add Your Signature',
    d: 'Draw, type or upload your signature and place it on a PDF, with initials and date. Free e-signature, no sign-up, no upload.',
    i: 'Sign documents without printing them. Draw your signature with a mouse or finger, type it in a handwriting font, or upload a photo of it, then place it with your initials and the date.',
    q: [['Can I use a photo of my signature?', 'Yes. Upload it and the background is made transparent.'],
      ['Is my signature stored online?', 'No. It stays on your device.']]
  },
  'watermark': {
    t: 'Watermark PDF – Add Text or Image Stamp Free',
    d: 'Stamp text or an image over PDF pages, with font, transparency, rotation and position. Free PDF watermark tool.',
    i: 'Mark PDFs as “Confidential”, “Draft” or with your logo. Choose the text or image, transparency, angle and position, and which pages get it.',
    q: [['Can I add my company logo?', 'Yes, use an image watermark.'], ['Can I apply it to only some pages?', 'Yes, choose the pages.']]
  },
  'rotate': {
    t: 'Rotate PDF – Turn PDF Pages Online Free',
    d: 'Rotate all, odd, even or selected pages of one or many PDFs and save it permanently. Free and private.',
    i: 'Fix pages that are sideways or upside down. Rotate every page, odd or even pages, or only the pages you choose, and save the PDF that way.',
    q: [['Is the rotation saved?', 'Yes, the downloaded PDF keeps it.'], ['Can I rotate just one page?', 'Yes.']]
  },
  'html-to-pdf': {
    t: 'HTML to PDF Converter – Free',
    d: 'Convert an HTML file or pasted HTML code into a PDF document in your browser. Free and private.',
    i: 'Save HTML pages, emails and code as PDF documents, ready to share or print.',
    q: [['Can I paste HTML code?', 'Yes, or open an .html file.'], ['Is CSS kept?', 'Yes, styles in the HTML are used.']]
  },
  'unlock': {
    t: 'Unlock PDF – Remove PDF Password Free',
    d: 'Remove the password from a PDF you know the password for, so it opens without asking. Free and private.',
    i: 'Tired of typing the password every time? If you know a PDF’s password, enter it once and save a copy that opens without one.',
    q: [['Can it unlock a PDF without the password?', 'No. You need to know the password; this tool removes it for convenience.'],
      ['Is the password sent anywhere?', 'No, everything happens on your device.']]
  },
  'protect': {
    t: 'Protect PDF with Password – AES-256, Free',
    d: 'Add a password to a PDF with AES-256 encryption and choose whether readers may print, copy or change it. Free and private.',
    i: 'Keep sensitive PDFs private. Set a password to open the file with strong AES-256 encryption, and choose whether printing, copying or editing is allowed.',
    q: [['How strong is the protection?', 'AES-256, the same standard used by banks.'], ['Is my file uploaded?', 'No.']]
  },
  'remove-pages': {
    t: 'Remove Pages from PDF – Delete PDF Pages Free',
    d: 'Delete pages from a PDF by clicking them or typing page numbers. Free, fast and private.',
    i: 'Remove blank, extra or unwanted pages. Click the pages to delete or type page numbers such as 2, 5–7, and download the cleaned-up PDF.',
    q: [['Can I see the pages before deleting?', 'Yes, every page is shown as a thumbnail.'], ['Is the rest of the PDF changed?', 'No.']]
  },
  'extract-pages': {
    t: 'Extract Pages from PDF – Save Pages as New PDF',
    d: 'Take pages out of a PDF into a new file, or save each page as its own PDF. Free and private.',
    i: 'Need only a few pages? Choose them and save them as a new PDF, or turn every page into a separate file.',
    q: [['Can I extract non-consecutive pages?', 'Yes, for example 1, 4 and 9–12.'], ['Is the original kept?', 'Yes, a new file is made.']]
  },
  'organize': {
    t: 'Organize PDF – Reorder, Rotate, Delete Pages Free',
    d: 'Reorder, rotate, delete and duplicate PDF pages, add blank pages or pages from other PDFs. Free visual PDF organizer.',
    i: 'Arrange pages exactly as you want with drag and drop. Rotate, delete or duplicate pages, insert blank pages, and bring in pages from other PDFs.',
    q: [['Can I add pages from another PDF?', 'Yes.'], ['Does it work on touch screens?', 'Yes, drag with your finger.']]
  },
  'pdf-to-pdfa': {
    t: 'PDF to PDF/A Converter – Archive PDFs Free',
    d: 'Convert PDFs to PDF/A-2b for long-term archiving, with an optional searchable text layer. Free and private.',
    i: 'Courts, governments and archives often ask for PDF/A. Convert your documents to PDF/A-2b, and optionally make scanned pages searchable.',
    q: [['What is PDF/A?', 'A version of PDF designed to look the same for decades, used for archiving and legal filing.'], ['Is it free?', 'Yes.']]
  },
  'repair': {
    t: 'Repair PDF – Fix Damaged or Corrupt PDF Files Free',
    d: 'Rebuild a damaged PDF and recover as many pages as possible. Free PDF repair tool, private.',
    i: 'If a PDF will not open or shows errors, EditSupreme rebuilds its structure and recovers as many pages as possible.',
    q: [['Can every PDF be repaired?', 'Not always, but most files with structure errors can be fully or partly recovered.'], ['Is the file uploaded?', 'No.']]
  },
  'page-numbers': {
    t: 'Add Page Numbers to PDF – Free',
    d: 'Add page numbers to a PDF with your choice of position, format, starting number and font. Free and private.',
    i: 'Number the pages of reports, theses and documents. Choose the position, format such as “Page 1 of 10”, the starting number, and the font.',
    q: [['Can I start numbering from page 3?', 'Yes, choose which pages get numbers and the first number.'], ['Can I use “Page X of Y”?', 'Yes.']]
  },
  'scan': {
    t: 'Scan to PDF – Use Your Phone Camera as a Scanner',
    d: 'Capture documents with your camera, clean them up and save them as a PDF. Free document scanner in your browser.',
    i: 'Your phone is a scanner. Take photos of documents, receipts or notes, straighten and clean them up, and save everything as one PDF.',
    q: [['Do I need an app?', 'No, it works in your phone’s browser.'], ['Can I scan several pages into one PDF?', 'Yes.']]
  },
  'ocr': {
    t: 'OCR PDF – Make Scanned PDFs Searchable Free',
    d: 'Make scanned PDFs searchable and selectable with OCR text recognition in 12 languages, including Hindi. Free and private.',
    i: 'Scanned PDFs are just pictures of text. OCR reads the words so you can search, select and copy them, while the pages look exactly the same.',
    q: [['Which languages are supported?', 'Twelve, including English and Hindi.'], ['Does the PDF look different afterwards?', 'No, an invisible text layer is added.']]
  },
  'compare': {
    t: 'Compare PDF – Find Differences Between Two PDFs',
    d: 'See two PDF versions side by side with text changes and visual differences highlighted. Free and private.',
    i: 'Check what changed between two versions of a contract, report or drawing. Text changes and visual differences are highlighted side by side.',
    q: [['Does it compare scanned PDFs?', 'Visual differences are shown for any pages; text comparison needs selectable text.'], ['Are my files uploaded?', 'No.']]
  },
  'redact': {
    t: 'Redact PDF – Black Out Sensitive Text Permanently',
    d: 'Black out text and areas in a PDF, or search and redact words. Redacted content is truly removed, not just covered. Free.',
    i: 'Hide account numbers, names and addresses safely. Draw over areas or search for words to redact; the hidden content is removed from the file, not just covered with a box.',
    q: [['Can the redacted text be recovered?', 'No. It is removed from the PDF, not just hidden.'], ['Can I redact every match of a word?', 'Yes, search and redact all at once.']]
  },
  'crop': {
    t: 'Crop PDF – Trim PDF Margins Online Free',
    d: 'Draw a crop box on a PDF page and apply it to one page or the whole document. Free and private.',
    i: 'Trim white margins or cut a PDF down to the part you need. Draw a box and apply it to one page or every page.',
    q: [['Can I crop all pages at once?', 'Yes.'], ['Is it free?', 'Yes.']]
  },
  'forms': {
    t: 'Fill PDF Forms Online Free – Add Fields and Checkboxes',
    d: 'Fill existing PDF forms, auto-detect blank lines, or add text fields and checkboxes to any PDF. Free and private.',
    i: 'Fill in application and registration forms without printing. Fill existing form fields, let EditSupreme find the blank lines for you, or add your own text boxes and checkboxes.',
    q: [['Can I fill a PDF that has no form fields?', 'Yes. Blank lines are found automatically, or add text boxes anywhere.'], ['Can I sign it too?', 'Yes, with Sign PDF.']]
  },
  'summarize': {
    t: 'Summarize PDF with AI – Free Key Points',
    d: 'Get the key points and a short summary of any PDF, written by the AI built into Chrome and Edge, on your device.',
    i: 'Get the gist of a long PDF in seconds. The summary and key points are written by the AI built into recent versions of Chrome and Edge, so the document stays on your device.',
    q: [['Which browsers does it work in?', 'Recent Chrome and Edge versions that include built-in AI.'], ['Is the PDF sent anywhere?', 'No.']]
  },
  'translate': {
    t: 'Translate PDF – Hindi, Telugu, Tamil & 30+ Languages',
    d: 'Translate a PDF into 30+ languages including Hindi, Telugu, Tamil, Spanish, Arabic and Chinese while keeping its layout. Free, on your device.',
    i: 'Read and share documents in another language. EditSupreme translates the text of your PDF and keeps the layout, with more than 30 languages including Indian languages.',
    q: [['Is the layout kept?', 'Yes, translated text is placed where the original text was.'], ['Which Indian languages are supported?', 'Hindi, Telugu, Tamil and more.']]
  },
  'pdf-to-md': {
    t: 'PDF to Markdown Converter – Free',
    d: 'Convert PDFs to Markdown with headings, lists and links preserved, for notes, docs and AI tools. Free and private.',
    i: 'Turn PDFs into clean Markdown for note apps, documentation and AI chat tools, with headings, lists and links kept.',
    q: [['Where can I use the Markdown?', 'Obsidian, Notion, GitHub, documentation sites and AI chat tools.'], ['Is it free?', 'Yes.']]
  },
  'pdf-to-text': {
    t: 'PDF to Text – Extract Text from PDF Free',
    d: 'Extract all the text from a PDF into a plain .txt file. Free, fast and private.',
    i: 'Get the plain text out of any PDF in one click, saved as a .txt file. For scanned PDFs, run OCR PDF first.',
    q: [['What about scanned PDFs?', 'Use OCR PDF first to recognise the text.'], ['Is formatting kept?', 'No, it is plain text.']]
  },
  'font-finder': {
    t: 'Font Finder from Image – Identify Fonts Free',
    d: 'Upload a logo, poster or screenshot and find the font, with the closest free Google Fonts you can use. Free font identifier.',
    i: 'Seen a font you like? Upload a picture of it and EditSupreme suggests the closest matching fonts from Google Fonts, all free to use in your own designs.',
    q: [['Are the suggested fonts free?', 'Yes, they are Google Fonts, free for personal and commercial use.'], ['What picture works best?', 'A clear, straight image of a few words.']]
  },
  'screenshot-to-template': {
    t: 'Screenshot to Editable Template – Free',
    d: 'Upload a screenshot of any design and get it rebuilt in high resolution as an editable template with layers and matched fonts.',
    i: 'Found a design you want to remake? Upload a screenshot and it is rebuilt as an editable template in high resolution, with text you can change, matched fonts and separate layers, ready in Design Studio.',
    q: [['Is the text editable?', 'Yes, text is recognised and set in the closest matching font.'], ['Can I change colours and pictures?', 'Yes, every part becomes its own layer.']]
  },
  'image-to-layers': {
    t: 'Image to Layers – Split a Photo into Editable Layers, AI',
    d: 'Split any photo, design or poster into layers with free on-device AI: cut out objects and people, fill in the background, and edit text.',
    i: 'Click any person or object in a picture to cut it out as its own layer; the background behind it is filled in by AI so you can move it freely. Text, shapes and graphics in designs become editable layers too.',
    q: [['Can I move a person in a photo?', 'Yes. Cut them out as a layer and the gap behind them is filled in.'], ['Is the AI free?', 'Yes. It runs on your device and is downloaded once.']]
  },
  'image-hd': {
    t: 'Recreate Image in HD – Sharpen and Enlarge 2×, 3×, 4×',
    d: 'Recreate a picture at 2×, 3× or 4× resolution: text and shapes redrawn razor-sharp, photos enlarged with on-device AI. Free.',
    i: 'Make blurry logos, posters and screenshots crisp. Text and shapes are redrawn sharply at a higher resolution and photos are enlarged with AI.',
    q: [['What works best?', 'Logos, posters, social posts and screenshots with text.'], ['Is it free?', 'Yes.']]
  },
  'image-to-editable': {
    t: 'Image to Editable Text – Scanned Resume to Word & PDF',
    d: 'Turn a picture or scanned PDF of a resume or document into an editable Word file and PDF that looks the same. Free and private.',
    i: 'Lost the original file of your resume or letter? Upload a photo or scan and get an editable Word document and PDF that keep the same look, ready to update.',
    q: [['Can I edit a scanned resume?', 'Yes, that is exactly what this tool is for.'], ['Which files can I upload?', 'Photos (JPG, PNG) and scanned PDFs.']]
  },
  'edit-images': {
    t: 'Edit Images in PDF – Change Words in Scans and Pictures',
    d: 'Change the words inside pictures and scanned PDF pages, erase parts of images, and replace, crop or recolour them. Free.',
    i: 'Edit what is inside the pictures of a PDF: change words in scanned pages, erase marks, replace, crop or recolour images.',
    q: [['Can I change text that is part of an image?', 'Yes, the words are recognised and can be retyped to blend in.'], ['Is it free?', 'Yes.']]
  },
  'workflow': {
    t: 'PDF Workflow Automation – Chain PDF Tools Free',
    d: 'Chain PDF tools such as rotate, watermark, page numbers, compress and protect into one reusable workflow. Free.',
    i: 'Do the same steps every time? Build a workflow, for example rotate, add page numbers, watermark, compress and protect, then run it on any PDF in one click.',
    q: [['Can I save a workflow?', 'Yes, it is kept for next time.'], ['Can it run on several PDFs?', 'Yes.']]
  }
};

Object.assign(CONTENT, {
  'exam-photo': {
    t: 'Resize Photo & Signature for SSC, UPSC, IBPS, NEET Forms',
    d: 'Make your photo and signature the exact pixels and KB that SSC, UPSC, IBPS, SBI, NEET and JEE forms ask for, in one click. Free, no upload.',
    i: 'Online exam forms reject photos and signatures that are the wrong size. Choose your exam, add your photo or signature, and EditSupreme sets the exact width, height and file size in KB, crops it neatly and cleans up signatures to dark ink on white paper. For any other form, type the sizes yourself.',
    s: ['Choose your photo or a picture of your signature.', 'Pick your exam (or “Other exam” to type the sizes) and say whether it is a photo or a signature.', 'Press the button and download the JPG, ready to upload.'],
    q: [['What size should the IBPS photo and signature be?', 'IBPS and SBI forms usually ask for a 200 × 230 px photo of 20–50 KB and a 140 × 60 px signature of 10–20 KB. Always check the latest notice for your exam.'],
      ['My form says the file is too small. What do I do?', 'Some forms also have a minimum size. The tool keeps your file above the minimum as well as below the maximum.'],
      ['Can it add my name and date under the photo?', 'Yes, tick “Print name and date under the photo” if your form asks for it.']]
  },
  'id-card-print': {
    t: 'Aadhaar & ID Card Print – Front and Back on One A4 Page',
    d: 'Print the front and back of an Aadhaar, PAN, voter ID or any card on one A4 page at real card size. Free, private, no upload.',
    i: 'Need a photocopy-style print of your Aadhaar, PAN card, voter ID, driving licence or office ID? Add photos or scans of the front and back and get one A4 page with both sides at real card size (85.6 × 54 mm), with cut lines. Several cards can go on one page.',
    s: ['Choose the front of the card, then the back. For more cards add front, back, front, back…', 'Pick the paper (A4 or Letter), the layout and the size.', 'Download the PDF and print it at 100% (“Actual size”).'],
    q: [['Will it print at the real card size?', 'Yes, as long as you print at 100% or “Actual size”, not “Fit to page”.'],
      ['Is it safe to use with my Aadhaar card?', 'Yes. The card photos are processed on your device and are never uploaded.']]
  },
  'collage-maker': {
    t: 'Photo Collage Maker – Free Grid for Instagram & WhatsApp',
    d: 'Combine photos into a collage: grid, rows or one big photo with small ones, sized for Instagram, WhatsApp status or A4 print. Free, no watermark.',
    i: 'Put your best photos together in one picture. Choose a grid, rows that keep each photo’s shape, or one big photo with smaller ones beside it. Pick a size for Instagram, stories or print, and set the spacing, rounded corners and background colour.',
    q: [['How many photos can I use?', 'Two or more; around 2 to 12 look best.'], ['Is there a watermark?', 'No.']]
  },
  'image-to-text': {
    t: 'Image to Text – Copy Text from Photos (OCR), Free',
    d: 'Copy text from photos, screenshots and scanned pages with OCR in 14 languages including Hindi, Telugu, Tamil and Bengali. Free, private, no upload.',
    i: 'Get editable text out of any picture: a photo of a notice, a screenshot, a scanned letter or a page of a book. The text is recognised on your device, copied to your clipboard and saved as a .txt file.',
    q: [['Which languages can it read?', 'English, Hindi, Telugu, Tamil, Kannada, Marathi, Bengali, Gujarati, Spanish, French, German, Portuguese, Arabic and Chinese.'],
      ['How do I get the best result?', 'Use a sharp, straight, well-lit picture and choose the right language.']]
  },
  'qr-code': {
    t: 'QR Code Generator – Free UPI, Wi-Fi, Link QR with Logo',
    d: 'Make free QR codes for websites, UPI payments, Wi-Fi, contacts, WhatsApp, email and text. Custom colours and logo, PNG and SVG download.',
    i: 'Create a QR code in seconds. Choose what it should open (a link, a UPI payment, your Wi-Fi network, a contact card, a WhatsApp chat and more), change the colours, add your logo, and download it as PNG or SVG for printing. The codes never expire.',
    q: [['Do these QR codes expire?', 'No. The information is inside the code itself, so it keeps working.'],
      ['Can I make a UPI QR code for my shop?', 'Yes. Choose “UPI payment”, enter your UPI ID and name, and optionally a fixed amount.'],
      ['Can I add my logo?', 'Yes. The code is made stronger automatically so it still scans with a logo in the middle.']]
  },
  'video-to-mp3': {
    t: 'MP4 to MP3 Converter – Extract Audio from Video, Free',
    d: 'Convert MP4, WEBM and MOV videos or audio files to MP3 on your device. Choose quality and cut a start and end time. Free, no upload, no limits.',
    i: 'Save the sound of your own videos as MP3: speeches, lectures, voice notes or music you made. Choose the quality, optionally keep only part of it with a start and end time, and convert many files at once. Your files never leave your device.',
    q: [['Which video formats work?', 'MP4, WEBM and M4A work in every browser; MOV and MKV work in Chrome and Edge.'],
      ['Can I cut just part of the audio?', 'Yes. Type a start and end time, for example 0:30 and 3:45.']]
  },
  'invoice-generator': {
    t: 'Free GST Invoice Generator – Make Invoice PDF Online',
    d: 'Make GST tax invoices, quotations and bills as PDF with CGST/SGST or IGST, HSN codes, logo, amount in words and a UPI scan-to-pay QR code. Free.',
    i: 'Create professional GST invoices in minutes. Add your business details once (they are remembered in your browser), then your customer and items with HSN/SAC codes and GST rates. EditSupreme works out CGST and SGST or IGST, writes the amount in words, adds your bank details and a UPI QR code with the amount, and makes a clean PDF.',
    q: [['Does it calculate GST?', 'Yes. Choose CGST + SGST for a customer in your state or IGST for another state; tax is calculated at each item’s rate.'],
      ['Can I make a quotation or proforma invoice?', 'Yes. Choose the document type: tax invoice, invoice, quotation, proforma invoice, bill of supply or receipt.'],
      ['Where are my business details saved?', 'Only in your own browser. Nothing is sent to us.']]
  },
  'resume-builder': {
    t: 'Free Resume Builder & Editor – Edit Your Old Resume Online',
    d: 'Make a new resume or edit your old one: import PDF, Word or a photo, pick from 12 templates, drag to reorder, check it, download PDF and Word.',
    i: 'Build a resume from scratch or bring in the one you already have. Import a PDF, Word file or even a photo of your old resume and it is sorted into editable sections. Like a design you saw? Upload a picture of it and EditSupreme sets up the closest layout, colour, fonts and photo style. Drag sections and entries into any order, hide or rename them, add your own sections, and switch between 12 templates with a live preview. The checker points out missing details, weak wording and spelling slips, and shows which keywords from a job description you are missing. Download as PDF, Word or ATS-friendly plain text. Everything stays in your browser.',
    s: ['Start a new resume, or press “Import old resume” and choose your PDF, Word file or photo.', 'Edit the text, drag sections into the order you want, and pick a template, colour and font in Design.', 'Open “Check & improve” to fix problems, then download PDF or Word.'],
    q: [['Can I edit a resume I already have?', 'Yes. Import a PDF, Word (.docx) file or a photo of it. The text is read on your device and placed into editable sections. Check each section afterwards, because no reader is perfect.'],
      ['Can it copy the design of another resume?', 'Upload a picture of a resume you like with “Match a design”. It detects the layout (sidebar, header band, columns), colour, fonts and photo style and applies the closest of our templates. For an exact copy of one page, use Image to editable.'],
      ['Do I need AI or an account?', 'No. Importing, checking and all the templates work with built-in rules on your device. If your browser has its own built-in AI (recent Chrome or Edge), extra buttons can improve your points and write a summary, still on your device.'],
      ['Is it ATS friendly?', 'Yes. The PDF has real, selectable text, and the ATS plain template, Word file and .txt export are one simple column that tracking systems read well.'],
      ['Can I keep several versions?', 'Yes. Make as many resumes as you like, duplicate one to tailor it for another job, and switch between them. They are saved in this browser only.'],
      ['Is it really free, with no watermark?', 'Yes, download as many times as you like.']]
  },
  'font-pairs': {
    "t": "Font Pairing Tool – Free Google Font Combinations",
    "d": "Find fonts that look good together: 50 hand-picked Google font pairs by style, previewed on your own image, with colour palettes. Copy CSS or download PNG.",
    "i": "Choosing fonts is quicker when you can see them on your own design. Browse 50 hand-picked Google font pairs sorted by what you are making (luxury, food, tech, wedding, sales, Hindi-ready and more), add your picture to see the headline and text on it, and drag the text where you want it. EditSupreme looks at your image and suggests the pairs and colours that suit it. Make your own pair from the 1,900+ Google fonts, save favourites, then download a PNG or copy the CSS for your website.",
    "s": [
      "Pick a style such as Elegant, Bold ads or Tech, or add your picture to get suggestions.",
      "Click a pair to try it, edit the text, layout and colours, and drag the text into place.",
      "Download a PNG or copy the CSS, and save the pairs you like."
    ],
    "q": [
      [
        "Are these fonts free for commercial use?",
        "Yes. They are all Google Fonts, free for personal and commercial work."
      ],
      [
        "Can I make my own combinations?",
        "Yes. Choose any headline and text font from the full Google Fonts library, set the weight, capitals and spacing, and save it to My pairs."
      ],
      [
        "How does it suggest fonts for my image?",
        "It measures the brightness, colourfulness and warmth of your picture and ranks the pairs that suit that mood, then picks black or white text that reads well on it."
      ]
    ]
  },
  'ai-video-ad': {
    "t": "AI Video Ad Maker – Free Reels & Video Ads from Photos",
    "d": "Make video ads, reels and shorts from your photos and clips. AI writes the script and voice-over, copies the style of ads you like, and exports MP4. Free, no watermark.",
    "i": "Create video ads without expensive subscriptions. Add your product photos or clips, say what you are selling and the offer, and optionally add screenshots or videos of ads you like. EditSupreme copies their colours, mood and pace (not their pictures or words), writes a hook-first script with on-device AI, chooses fonts that fit, and builds scenes with motion, transitions, your logo and music. Add a natural AI voice-over, edit any scene, and export a 9:16, 1:1, 4:5 or 16:9 video. For finishing touches, open it in FilmCraft, our full video editor.",
    "s": [
      "Add your photos or clips, and (optionally) a few ads you like as reference.",
      "Write the product, key points, offer and call to action, pick a tone and length, then press “Create my ad”.",
      "Edit the scenes, style, music and voice-over, then export the video or finish it in FilmCraft."
    ],
    "q": [
      [
        "Is it free? Is there a watermark?",
        "Yes, it is free and there is no watermark."
      ],
      [
        "Does it upload my videos?",
        "No. The script, voice-over and video are all made in your browser. The AI models download once and then run on your device."
      ],
      [
        "Can it copy an ad I like?",
        "It copies the look: colours, mood and how fast the shots change, and picks matching fonts. It does not copy other brands’ pictures, words or music."
      ],
      [
        "Which format does it export?",
        "MP4 (H.264) in Chrome and Edge, WebM in some other browsers. Choose 9:16 for Reels, Stories and Shorts, 1:1 or 4:5 for feeds, 16:9 for YouTube."
      ],
      [
        "Can I keep editing in a real video editor?",
        "Yes. “Finish in FilmCraft” opens your ad, clips and music in FilmCraft, the full video editor on this site."
      ]
    ]
  },
  'ai-writer': {
    "t": "AI Writer – Free Ad Copy, Caption & Script Generator",
    "d": "Write ad copy, Instagram captions with hashtags, product descriptions, video scripts, slogans and emails with free AI that runs on your device.",
    "i": "Get words for your marketing in seconds. Say what you are promoting and who it is for, pick a tone, and the AI Writer drafts ad copy, captions with hashtags, product descriptions, video ad scripts, headlines, YouTube titles, bios and emails, or rewrites your own text. It uses the AI built into Chrome and Edge, or a small open model in your browser, so your ideas stay private.",
    "s": [
      "Choose what to write and describe your product or topic.",
      "Pick the tone, length and number of options, then press Write.",
      "Copy the result, write again, or turn it into a voice-over."
    ],
    "q": [
      [
        "Is it really free?",
        "Yes. The AI runs on your own device, so there are no credits or limits."
      ],
      [
        "Which browsers work best?",
        "Chrome and Edge on a computer use their built-in AI. Other browsers download a small open model (about 800 MB) once."
      ]
    ]
  },
  'ai-voiceover': {
    "t": "AI Voice-over – Free Text to Speech MP3",
    "d": "Turn text into a natural voice-over for reels, ads and videos. 13 US and UK voices, adjustable speed, download MP3 or WAV. Free and private.",
    "i": "Need a narrator for your video? Paste your script, choose from 13 natural US and UK English voices, set the speed and get a voice-over in seconds. It uses Kokoro, an open-source voice model that runs in your browser, so your script is never uploaded and you can use the audio commercially.",
    "s": [
      "Type or paste your script.",
      "Pick a voice and speed, then press “Make voice-over”.",
      "Listen, then download MP3 or WAV."
    ],
    "q": [
      [
        "Can I use the voice-over in ads?",
        "Yes. The Kokoro model is released under the Apache 2.0 licence."
      ],
      [
        "Which languages?",
        "US and UK English for now."
      ]
    ]
  },
  'smart-crop': {
    "t": "AI Smart Crop – Resize Photos for Every Social Size",
    "d": "Crop one photo for Instagram, Stories, YouTube thumbnails, Facebook and LinkedIn at once. AI keeps faces and products in frame. Download all as ZIP.",
    "i": "Posting the same picture everywhere means cropping it again and again. AI Smart crop finds the faces or the main subject in your photo and cuts it for every size you tick (Instagram post and portrait, Stories and Reels, YouTube thumbnail, Facebook post and cover, LinkedIn banner, X, Pinterest and more), keeping the important part in view. Download each picture or all of them as a ZIP.",
    "s": [
      "Add one or more photos.",
      "Tick the sizes you need.",
      "Press “Crop for all sizes” and download."
    ],
    "q": [
      [
        "Does it upload my photos?",
        "No. Faces and subjects are found on your device."
      ],
      [
        "What if my photo is smaller than the size?",
        "It is enlarged smoothly; for the sharpest result use Upscale image first."
      ]
    ]
  }
});

// Extra pages for common searches, each opening the tool that does the job.
export const EXTRA = [
  {
    slug: 'image-to-pdf', tool: 'jpg-to-pdf',
    t: 'Image to PDF Converter – Photos, PNG, HEIC to PDF Free',
    d: 'Convert images and photos to PDF: JPG, PNG, WEBP, iPhone HEIC, TIFF and more, many in one PDF. Choose A4 or Letter and margins. Free, no upload.',
    h: 'Convert images and photos to PDF',
    i: 'Put photos, screenshots and scanned pages into one PDF that is easy to share, print or upload. JPG, PNG, WEBP, GIF, BMP, iPhone HEIC, TIFF, SVG and Photoshop PSD files all work. Arrange the pictures in order, choose the page size and margins, and download one PDF, or one PDF per picture.',
    s: ['Choose your photos or images, or take a photo with your phone camera.', 'Drag them into the order you want, then pick the page size (same as the image, A4, Letter, Legal or A5), orientation and margins.', 'Press Convert to PDF and download your PDF.'],
    q: [['Can I convert iPhone (HEIC) photos to PDF?', 'Yes. HEIC photos are converted automatically; there is no need to change them to JPG first.'],
      ['Can I put many photos in one PDF?', 'Yes. Keep “Merge all images into one PDF” ticked, or untick it to get a separate PDF for each picture.'],
      ['How do I make the PDF smaller?', 'Tick “Reduce file size”, or run the PDF through Compress PDF afterwards for an exact size such as 100 KB.']]
  },
  {
    slug: 'compress-pdf-to-100kb', tool: 'compress',
    t: 'Compress PDF to 100 KB, 200 KB or 500 KB – Free',
    d: 'Reduce a PDF to under 100 KB, 200 KB or 500 KB for online forms and job applications. Type the size and download. Free, no upload.',
    h: 'Compress a PDF to 100 KB (or any size)',
    i: 'Government, exam and job websites often accept PDFs only under 100 KB, 200 KB or 500 KB. Choose “Exact file size”, type the limit the website gives, and EditSupreme makes the PDF small enough while keeping it as readable as possible.',
    s: ['Choose your PDF.', 'Under Compression level pick “Exact file size”, type 100 (or the limit you need) and choose KB.', 'Press Compress PDF and download the smaller file.'],
    q: [['My PDF is still too big. What can I do?', 'Keep “If needed, turn pages into images” ticked. It lets the tool shrink scanned pages further to reach very small sizes.'],
      ['Will it still be readable?', 'Yes. The tool keeps the best quality that fits under your limit.']]
  },
  {
    slug: 'reduce-image-size-in-kb', tool: 'compress-image',
    t: 'Reduce Photo Size in KB – 20 KB, 50 KB, 100 KB, Free',
    d: 'Reduce JPG photo and signature size to 20 KB, 50 KB or 100 KB for online forms like SSC, UPSC, NEET and bank exams. Free, no upload.',
    h: 'Reduce photo size to 20 KB, 50 KB or 100 KB',
    i: 'Online application forms often want a photo under 50 KB and a signature under 20 KB. Choose “Exact file size”, type the limit from the form, and EditSupreme keeps your photo as clear as possible within it.',
    s: ['Choose your photo or signature image.', 'Pick “Exact file size” and type the size the form asks for, for example 20 KB.', 'Press the button and download the smaller JPG.'],
    q: [['How do I reduce a signature to under 20 KB?', 'Add the signature image, choose “Exact file size”, type 20 and choose KB.'],
      ['The form also needs exact pixels. Can I do both?', 'Yes. Use Resize image to set the width and height and tick “Also keep the file under a size”.']]
  },
  {
    slug: 'resize-photo-for-online-form', tool: 'resize-image',
    t: 'Resize Photo and Signature for Online Forms – Free',
    d: 'Resize your photo and signature to the exact pixels and KB that online forms ask for: SSC, UPSC, IBPS, NEET, passport and more. Free.',
    h: 'Resize a photo and signature for online forms',
    i: 'Each exam and application website gives its own rules, such as 200 × 230 pixels and under 50 KB for the photo, or 140 × 60 pixels and under 20 KB for the signature. Type the pixels from the form, tick “Also keep the file under a size”, and download a file that is accepted the first time.',
    s: ['Choose your photo or signature.', 'Type the width and height in pixels from the form’s instructions.', 'Tick “Also keep the file under a size”, type the KB limit, then resize and download.'],
    q: [['What if I need a passport-style photo with a white background?', 'Use the Passport photo tool, which also replaces the background and sizes your face to the rules.'],
      ['Will my face look stretched?', 'Choose “Crop to fill the exact size” or “Fit inside”, so nothing is stretched.']]
  }
];

// Shown on every tool page.
export const COMMON_Q = [
  ['Is EditSupreme free?', 'Yes. Every tool is free, with no sign-up, no watermarks and no daily limits.'],
  ['Are my files uploaded?', 'No. Your files are processed in your own browser and never leave your device.']
];
