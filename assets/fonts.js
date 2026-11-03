/* 外部フォントの応答を待たず、まずロード画面を描画する。 */
requestAnimationFrame(()=>requestAnimationFrame(()=>{
  var link=document.createElement('link');
  link.rel='stylesheet';
  link.href='https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap';
  document.head.append(link);
}));
