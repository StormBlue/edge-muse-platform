export const CATEGORY_ALIASES = {
  商品与广告: "商品广告与营销",
  "UI 与社媒截图": "UI 界面与产品图",
  信息图与知识卡: "知识卡片与科普",
  海报与插画: "海报与插画",
  "品牌标识与 Logo": "Logo 与品牌系统",
  角色与世界观: "角色设定与参考图",
  视频感关键帧: "电影分镜与关键帧"
};

export const CATEGORY_GROUPS = {
  人像与摄影: "photo",
  摄影写实与胶片: "photo",
  商品与广告: "commerce",
  商品广告与营销: "commerce",
  电商商品展示: "commerce",
  食品餐饮广告: "commerce",
  "品牌标识与 Logo": "commerce",
  "Logo 与品牌系统": "commerce",
  海报与插画: "poster",
  海报与字体设计: "poster",
  插画艺术与风格化: "poster",
  古典历史与国风: "poster",
  角色与世界观: "character",
  角色设定与参考图: "character",
  "IP 角色与世界观": "character",
  "UI 与社媒截图": "ui",
  "UI 界面与产品图": "ui",
  聊天与社交截图: "ui",
  直播与短视频界面: "ui",
  社交媒体截图: "ui",
  信息图与知识卡: "info",
  信息图表与数据: "info",
  知识卡片与科普: "info",
  文档排版与出版: "info",
  视频感关键帧: "cinematic",
  电影分镜与关键帧: "cinematic",
  游戏与娱乐场景: "cinematic",
  建筑空间与室内: "space"
};

export const CATEGORY_RULES = [
  {
    category: "直播与短视频界面",
    group: "ui",
    pattern: /直播截图|直播界面|直播间|live stream screenshot|douyin live|tiktok live|弹幕界面/
  },
  {
    category: "聊天与社交截图",
    group: "ui",
    pattern:
      /朋友圈截图|微信聊天|小红书主页|小红书截图|推文页面|x post page|social feed screenshot|chat interface|聊天界面|社交截图|homepage screenshot/
  },
  {
    category: "游戏与娱乐场景",
    group: "cinematic",
    pattern:
      /游戏截图|第一人称|game screenshot|screenshot from .*game|rpg|black myth|wukong|pokemon|minecraft|手游抽卡|游戏界面|关卡|boss|电竞/
  },
  {
    category: "UI 界面与产品图",
    group: "ui",
    pattern:
      /dashboard|app ui|ui design|ui system|ux|interface|wireframe|landing page|web page|网页界面|移动端界面|产品界面|操作台|控制台|设计系统/
  },
  {
    category: "电商商品展示",
    group: "commerce",
    pattern:
      /电商主图|商品主图|商品图|详情页|product listing|e-?commerce|淘宝详情|amazon|shopify|packshot|货架展示|白底图/
  },
  {
    category: "食品餐饮广告",
    group: "commerce",
    pattern:
      /食品广告|饮品广告|餐饮广告|restaurant menu|菜谱|recipe|美食地图|food map|beverage ad|茶饮|奶茶|饮料|牛排|海鲜|咖啡旅程|菜单图/
  },
  {
    category: "商品广告与营销",
    group: "commerce",
    pattern:
      /商品广告|ad creative|advertising campaign|marketing campaign|promo poster|promotion|营销海报|促销海报|海报广告|卖点|转化率|banner ad/
  },
  {
    category: "Logo 与品牌系统",
    group: "commerce",
    pattern:
      /logo概念|logo design|brand identity|visual identity|品牌系统|品牌身份|vi系统|brand book|徽标设计/
  },
  {
    category: "信息图表与数据",
    group: "info",
    pattern:
      /信息图|infographic|diagram|chart|timeline|graph|flowchart|数据图表|流程图|时间轴|关系图|架构图|拆解图|可视化/
  },
  {
    category: "知识卡片与科普",
    group: "info",
    pattern:
      /knowledge card|science encyclopedia|encyclopedia|education card|tutorial card|科普|知识卡|教学卡|百科|课程图|学习卡|讲解图/
  },
  {
    category: "文档排版与出版",
    group: "info",
    pattern:
      /document layout|publication|magazine spread|book cover|newspaper|resume|slide deck|ppt|report card|文档排版|杂志跨页|书籍封面|报纸版式|简历|幻灯片|报告卡片|出版物/
  },
  {
    category: "海报与字体设计",
    group: "poster",
    pattern:
      /typography poster|font poster|lettering|title design|字体海报|文字海报|排版海报|标题字|字形设计|招贴/
  },
  {
    category: "古典历史与国风",
    group: "poster",
    pattern:
      /ancient|classical|history|museum|chinese style|ink wash|国风|古风|历史|古典|水墨|宋代|唐代|明代|博物馆|诗词|长卷/
  },
  {
    category: "角色设定与参考图",
    group: "character",
    pattern:
      /character sheet|reference sheet|model sheet|turnaround|角色设定|三视图|参考图|设定图|人物设定|角色图鉴/
  },
  {
    category: "IP 角色与世界观",
    group: "character",
    pattern:
      /worldbuilding|mascot|creature|角色世界观|角色海报|角色卡牌|吉祥物|精灵|机甲|怪物|人物卡/
  },
  {
    category: "电影分镜与关键帧",
    group: "cinematic",
    pattern:
      /cinematic keyframe|film still|storyboard|movie poster|电影关键帧|电影海报|分镜|关键帧|剧照|镜头/
  },
  {
    category: "建筑空间与室内",
    group: "space",
    pattern:
      /architecture|interior design|room design|apartment|building exterior|city map|建筑空间|室内设计|空间设计|房间|公寓|城市地图|景观|店铺空间/
  },
  {
    category: "人像与摄影",
    group: "photo",
    pattern: /portrait|selfie|headshot|couple photo|人像|写真|肖像|情侣写真|胶片人像|杂志人像/
  },
  {
    category: "摄影写实与胶片",
    group: "photo",
    pattern:
      /photography|camera|film photo|35mm|iphone photo|raw photo|dslr|摄影|胶片|相机|手机照片|纪实|街拍|棚拍/
  },
  {
    category: "插画艺术与风格化",
    group: "poster",
    pattern:
      /illustration|anime|cartoon|watercolor|sketch|comic|manga|pixel art|插画|漫画|动漫|水彩|手绘|线稿|涂鸦|像素|艺术风格/
  }
];

export const SOURCE_TAG_ALIASES = {
  tech: "科技",
  commerce: "商业",
  ui: "UI",
  poster: "海报",
  realistic: "写实",
  character: "角色",
  social: "社交媒体",
  illustration: "插画",
  fashion: "时尚",
  infographic: "信息图",
  creative: "创意",
  brand: "品牌",
  product: "商品",
  story: "叙事",
  travel: "旅行",
  food: "餐饮",
  education: "教育",
  history: "历史",
  classical: "古典",
  documents: "文档",
  products: "商品",
  characters: "角色",
  photography: "摄影",
  architecture: "建筑",
  scenes: "场景",
  "other use cases": null
};

export const TAG_RULES = [
  {
    tag: "参考图编辑",
    pattern:
      /参考图|上传|原图|attached image|reference image|same subject|same person|edit|redesign|style transfer|重绘|改造|换风格/
  },
  { tag: "文字渲染", pattern: /文字|text|typography|font|标题|标语|caption|label|slogan|字形/ },
  {
    tag: "长文本",
    pattern: /整篇|全文|menu|document|report|long text|dense text|大量文字|文档|菜单/
  },
  { tag: "中文内容", pattern: /中文|汉字|国风|诗词|微信|小红书|淘宝|中国/ },
  { tag: "英文内容", pattern: /english|headline|poster text|brand slogan|copywriting/ },
  {
    tag: "信息密度高",
    pattern: /infographic|diagram|chart|timeline|知识|科普|图解|流程|关系图|拆解|架构/
  },
  {
    tag: "写实摄影",
    pattern: /photo|photography|camera|iphone|raw|dslr|realistic|真实|写实|纪实|街拍|棚拍/
  },
  { tag: "胶片感", pattern: /film|35mm|kodak|fuji|grain|胶片|颗粒|复古摄影/ },
  { tag: "商业广告", pattern: /advert|campaign|marketing|promo|商品|广告|营销|促销|卖点|转化/ },
  { tag: "品牌设计", pattern: /brand|logo|identity|品牌|标志|视觉识别|vi/ },
  { tag: "电商", pattern: /e-?commerce|商品图|详情页|淘宝|amazon|shopify|主图|货架/ },
  { tag: "餐饮", pattern: /food|restaurant|coffee|tea|drink|餐饮|咖啡|奶茶|饮料|美食|菜单/ },
  { tag: "社交媒体", pattern: /social|wechat|微信|小红书|instagram|twitter|朋友圈|社交|聊天/ },
  { tag: "直播界面", pattern: /live stream|直播|弹幕|douyin live|tiktok live/ },
  { tag: "移动端", pattern: /mobile|phone|smartphone|app|手机|移动端|竖屏/ },
  { tag: "仪表盘", pattern: /dashboard|analytics|数据看板|控制台|后台|图表面板/ },
  { tag: "地图", pattern: /map|地图|city map|路线|区域图/ },
  { tag: "时间轴", pattern: /timeline|时间轴|chronology/ },
  {
    tag: "角色一致性",
    pattern:
      /same character|consistent character|character sheet|reference sheet|同一角色|一致性|三视图/
  },
  { tag: "游戏场景", pattern: /game|rpg|游戏|关卡|boss|电竞/ },
  {
    tag: "电影感",
    pattern: /cinematic|film still|keyframe|storyboard|movie|电影|分镜|关键帧|镜头/
  },
  { tag: "建筑空间", pattern: /architecture|interior|room|building|建筑|室内|空间|房间/ },
  { tag: "国风古典", pattern: /ancient|classical|history|ink wash|国风|古风|历史|古典|水墨|诗词/ },
  { tag: "插画", pattern: /illustration|cartoon|anime|watercolor|sketch|插画|漫画|动漫|水彩|手绘/ },
  { tag: "3D", pattern: /3d|isometric|render|clay|blender|三维|立体|等距/ },
  { tag: "扁平设计", pattern: /flat|vector|矢量|扁平/ },
  { tag: "极简", pattern: /minimal|minimalist|极简|留白|简洁/ },
  { tag: "复古", pattern: /retro|vintage|nostalgic|复古|怀旧/ },
  { tag: "奢华", pattern: /luxury|premium|gold|高端|奢华|黑金/ },
  { tag: "可爱", pattern: /cute|kawaii|可爱|萌/ },
  { tag: "赛博朋克", pattern: /cyberpunk|neon|赛博|霓虹/ }
];

mkdirSync(reportRoot, { recursive: true });
ensureSources();
