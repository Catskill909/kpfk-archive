/* Plain text from upstream feeds — one decoder for every place feed text enters the app
 * (QIR catalog on the server, transcripts and cue-file songs in the browser).
 * Why (2026-09-25): Confessor stores titles and summaries as HTML fragments
 * ("What We&rsquo;re Up Against", some double-encoded, "&shy" without its semicolon),
 * QIR copies them through unchanged, and WebVTT itself escapes "&" as "&amp;".
 * The app escapes all text on output, so undecoded entities showed up literally.
 * kpfk-archive decodes the same Confessor text in lib/pacifica/normalize.js. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PlainText=factory();})(typeof window==='undefined'?this:window,function(){
  'use strict';
  var NAMED={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ensp:' ',emsp:' ',thinsp:' ',shy:'',zwj:'‍',zwnj:'‌',lrm:'‎',rlm:'‏',
    lsquo:'‘',rsquo:'’',sbquo:'‚',ldquo:'“',rdquo:'”',bdquo:'„',lsaquo:'‹',rsaquo:'›',laquo:'«',raquo:'»',
    ndash:'–',mdash:'—',hellip:'…',bull:'•',middot:'·',prime:'′',Prime:'″',dagger:'†',Dagger:'‡',permil:'‰',
    copy:'©',reg:'®',trade:'™',deg:'°',plusmn:'±',times:'×',divide:'÷',micro:'µ',para:'¶',sect:'§',
    cent:'¢',pound:'£',yen:'¥',euro:'€',curren:'¤',brvbar:'¦',uml:'¨',ordf:'ª',ordm:'º',not:'¬',macr:'¯',acute:'´',cedil:'¸',
    sup1:'¹',sup2:'²',sup3:'³',frac14:'¼',frac12:'½',frac34:'¾',iexcl:'¡',iquest:'¿',
    Agrave:'À',Aacute:'Á',Acirc:'Â',Atilde:'Ã',Auml:'Ä',Aring:'Å',AElig:'Æ',Ccedil:'Ç',Egrave:'È',Eacute:'É',Ecirc:'Ê',Euml:'Ë',
    Igrave:'Ì',Iacute:'Í',Icirc:'Î',Iuml:'Ï',ETH:'Ð',Ntilde:'Ñ',Ograve:'Ò',Oacute:'Ó',Ocirc:'Ô',Otilde:'Õ',Ouml:'Ö',Oslash:'Ø',
    Ugrave:'Ù',Uacute:'Ú',Ucirc:'Û',Uuml:'Ü',Yacute:'Ý',THORN:'Þ',szlig:'ß',
    agrave:'à',aacute:'á',acirc:'â',atilde:'ã',auml:'ä',aring:'å',aelig:'æ',ccedil:'ç',egrave:'è',eacute:'é',ecirc:'ê',euml:'ë',
    igrave:'ì',iacute:'í',icirc:'î',iuml:'ï',eth:'ð',ntilde:'ñ',ograve:'ò',oacute:'ó',ocirc:'ô',otilde:'õ',ouml:'ö',oslash:'ø',
    ugrave:'ù',uacute:'ú',ucirc:'û',uuml:'ü',yacute:'ý',thorn:'þ',yuml:'ÿ',OElig:'Œ',oelig:'œ',Scaron:'Š',scaron:'š',Yuml:'Ÿ',fnof:'ƒ',circ:'ˆ',tilde:'˜'};
  // Entities this table does not know are left as written and reported once each, so a
  // new one in the feed is seen and added here rather than silently shown or dropped.
  var reported={},onUnknown=function(name){if(typeof console!=='undefined')console.warn('Unknown HTML entity in feed text: &'+name+';');};
  function decodeOnce(s){
    return s.replace(/&(#[xX][0-9a-fA-F]{1,6}|#\d{1,7}|[a-zA-Z][a-zA-Z0-9]{1,31});|&shy(?!;)/g,function(whole,code){
      if(code===undefined)return ''; // "&shy" truncated by Confessor: a soft hyphen, invisible
      if(code[0]!=='#'){if(Object.prototype.hasOwnProperty.call(NAMED,code))return NAMED[code];if(!reported[code]){reported[code]=1;onUnknown(code);}return whole;}
      var n=code[1]==='x'||code[1]==='X'?parseInt(code.slice(2),16):Number(code.slice(1));
      // Windows-1252 numbers (&#146; for ’) are what HTML parsers map them to.
      if(n>=128&&n<=159)return CP1252[n-128]||'';
      return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):'�';
    });
  }
  var CP1252=['€','','‚','ƒ','„','…','†','‡','ˆ','‰','Š','‹','Œ','','Ž','','','‘','’','“','”','•','–','—','˜','™','š','›','œ','','ž','Ÿ'];
  // Up to three passes: some Confessor text is double-encoded ("&amp;rsquo;").
  function decode(value){
    var s=typeof value==='string'?value:'';
    for(var i=0;i<3&&s.indexOf('&')>=0;i++){var next=decodeOnce(s);if(next===s)break;s=next;}
    return s;
  }
  // Feed field → display text: tags out (line breaks kept), entities decoded, accents in
  // one Unicode form (NFC) so "é" typed two ways matches and renders the same.
  function plain(value){
    var s=typeof value==='string'?value:'';
    s=s.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/<\s*br\s*\/?\s*>|<\/?(?:p|div|li|h[1-6])\b[^>]*>/gi,'\n').replace(/<\/?[a-zA-Z][^>]*>/g,'');
    return decode(s).normalize('NFC').replace(/ /g,' ').replace(/\r\n?/g,'\n').replace(/[\t ]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
  }
  // Language labels arrive as words ("English", "Spanish") or codes ("en"), sometimes
  // empty. The page needs BCP 47 codes. Unknown labels give '' and are reported once.
  var LANG={english:'en',en:'en',eng:'en',spanish:'es',español:'es',espanol:'es',es:'es',spa:'es',
    french:'fr',français:'fr',francais:'fr',fr:'fr',fra:'fr',fre:'fr',portuguese:'pt',português:'pt',portugues:'pt',pt:'pt',por:'pt',
    arabic:'ar',ar:'ar',ara:'ar',haitian:'ht','haitian creole':'ht',ht:'ht',german:'de',de:'de',deu:'de',italian:'it',it:'it',ita:'it',
    korean:'ko',ko:'ko',kor:'ko',chinese:'zh',mandarin:'zh',zh:'zh',zho:'zh',japanese:'ja',ja:'ja',jpn:'ja',
    tagalog:'tl',tl:'tl',russian:'ru',ru:'ru',rus:'ru',hebrew:'he',he:'he',persian:'fa',farsi:'fa',fa:'fa',hindi:'hi',hi:'hi',
    armenian:'hy',hy:'hy',vietnamese:'vi',vi:'vi',swahili:'sw',sw:'sw'};
  function langCode(value){
    var v=String(value==null?'':value).trim().toLowerCase().replace(/_/g,'-');
    if(!v)return '';
    if(Object.prototype.hasOwnProperty.call(LANG,v))return LANG[v];
    var m=/^([a-z]{2,3})-[a-z0-9]{2,8}$/.exec(v); // "es-MX", "en-us": keep the region
    if(m&&Object.prototype.hasOwnProperty.call(LANG,m[1]))return LANG[m[1]]+v.slice(m[1].length).replace(/-([a-z]{2})$/,function(_,r){return '-'+r.toUpperCase();});
    if(!reported['lang:'+v]){reported['lang:'+v]=1;if(typeof console!=='undefined')console.warn('Unknown transcript language label: '+v);}
    return '';
  }
  return {decode:decode,plain:plain,langCode:langCode,setUnknownHandler:function(fn){onUnknown=fn;}};
});
