/**
 * 词汇重要性：用于「听写拼写」挑词
 *
 * 思路参考雅思类词书（雅思词汇真经 / 四级词汇 / 雅思核心词伙）的选词口径：
 *   1. 学术高频词（AWL 一类：analyze / significant / approach …）
 *   2. 雅思各话题的核心词（环境、教育、科技、健康、社会、经济…）
 *   3. 正文里反复出现、但又不是 the/is/of 这种功能词的实词
 *   4. 跟读评分偏低的那句里包含的词（说明这个词你读不准，更该练）
 */

// 学术高频（AWL 主干）+ 雅思话题核心词
const CORE = `
abandon abstract academic accommodate accompany accomplish accumulate accurate achieve acknowledge acquire adapt adequate
adjust administration admit adopt advance advocate affect aggregate allocate alter alternative ambiguous amend analyse analyze
annual anticipate apparent append appreciate approach appropriate approximate arbitrary area assess assign assist assume
assure attach attain attitude attribute authority available aware behalf benefit bias brief bulk capable capacity category
cease challenge channel circumstance cite civil clarify classic coherent coincide collapse colleague commence comment
commission commit commodity communicate community compatible compensate compile complement complex component compound
comprehensive comprise compute conceive concentrate concept conclude concurrent conduct confer confine confirm conflict
conform consent consequent considerable consist constant constitute constrain construct consult consume contact
contemporary context contract contradict contrary contrast contribute controversy convene convert convince cooperate
coordinate core corporate correspond couple create credit criterion crucial culture currency cycle data debate decade
decline deduce define demonstrate denote deny derive design despite detect deviate devise devote diagnose differ
differentiate dimension diminish discrete discriminate displace display dispose distinct distort distribute diverse document
domain domestic dominate draft dramatic duration dynamic economy edit element eliminate emerge emphasis empirical enable
encounter enforce enhance ensure entity environment equate equip equivalent erode establish estimate ethic evaluate
eventual evident evolve exaggerate exceed exclude exhibit expand expert explicit exploit export expose external extract
facilitate factor feature federal fee file final finance finite flexible fluctuate focus format formula forthcoming
found framework fraud function fundamental furthermore gender generate generation globe goal grade grant guarantee
guideline hence hierarchy highlight hypothesis identical identify ideology illustrate image immigrate impact implement
imply impose incentive incidence incline income incorporate index indicate individual induce inevitable infer inhibit
initial initiate innovate input insert insight inspect instance institute instruct integrate integrity interact
interpret interval intervene intrinsic invest investigate invoke involve isolate issue item job journal justify label
labor labour layer lecture legal legislation levy liberal licence license likewise link locate logic maintain major
manipulate manual margin mature maximize maximum mechanism media mediate medium mental method migrate military minimal
minimize minimum ministry minor mode modify monitor motive mutual negate network neutral nevertheless nonetheless
normal notion notwithstanding nuclear objective obtain obvious occupy occur odd offset ongoing option orient outcome
overall overlap overseas panel paradigm parameter participate particular partner passive perceive percent period persist
perspective phase phenomenon policy portion pose positive potential practitioner precede precise predict preliminary
presume previous primary principal principle priority proceed process professional prohibit project promote proportion
prospect protocol psychology publish purchase pursue qualitative quote radical random range ratio rational react recover
refine regime region register regulate reinforce reject relax release relevant reluctance rely remove require research
reside resolve resource respond restore restrain restrict retain reveal revenue reverse revise revolution rigid role
route scenario schedule scheme scope section sector secure seek select sequence series sex shift significance similar
simulate site so-called sole somewhat source specific specify sphere stable statistic status straightforward strategy
stress structure submit subordinate subsequent subsidy substitute successor sufficient sum summary supplement survey
survive suspend sustain symbol tape target task team technical technique technology temporary tense terminate text
theme theory thereby thesis topic trace tradition transfer transform transit transmit transport trend trigger ultimate
undergo underlie undertake uniform unify unique utilize valid vary vehicle version via violate virtual visible vision
visual volume voluntary welfare whereas whereby widespread

accommodation advertisement agriculture alternative ambulance ancient anniversary anxiety appetite architecture argument
assignment atmosphere audience bachelor balance behaviour behavior biodiversity biology botany budget cafeteria campus
carbon career carnival ceremony certificate charity chemistry circumstance climate colleague commerce committee communication
commuter competition complaint concert conference conflict conservation consultant consumer consumption container
continent contract convenience cooperation corporate corruption creativity crime crisis cuisine cultivation curriculum
customer cyber deadline debate decade decrease deficit degree democracy department depression desert destination
development diet disaster discipline discrimination disease distance distraction diversity doctor drought ecology
economics ecosystem education efficiency election electricity element emission emotion employee employment encourage
energy engagement engine engineering entertainment enthusiasm entrepreneur envelope equipment essay evidence evolution
exam examination excitement exhibition expense experiment expert exploration exposure express extracurricular facility
factory faculty failure famine fashion fatigue fee festival fibre fiber fiction finance firework fitness flavour flavor
flexibility flood fluency focus food forecast foreigner forest fortune foundation freedom frequency fuel function furniture
gallery garbage generation genetics geography gesture globalization government graduate grammar greenhouse growth
guidance gymnastics habit habitat handicap harvest headline health heritage historian hobby holiday homework horizon
hospital hostel household housing humanity humidity hunting hurricane hygiene hypothesis identity illusion imagination
immigrant impact import impression improvement income increase industry infection inflation influence ingredient
initiative injury innovation insect inspiration instinct institution instruction instrument insurance intelligence
interaction interest international internet interview invention investigation investment invitation irrigation journal
journalist journey judgement judgment justice knowledge laboratory labour labor landscape language laptop laughter
leisure lesson library lifestyle lighting literacy literature litter loan location luxury magazine majority mammal
management manufacture map marathon market marriage material mathematics measure mechanic media medicine memory
mental message method microscope migration milk mineral minority mistake mixture mobile model modern money monitor
monument mood motivation mountain movement museum musician mystery narrative nation nationality nature neighbour neighbor
neighbourhood neighborhood network newspaper noise nutrition obesity occupation ocean offer office opinion opportunity
opposition option orchestra organization origin outcome outdoor output ownership packaging painting pandemic paper
paragraph participant passenger passion passport patience pattern payment peace peak penalty pension percentage
performance period permission personality perspective phenomenon philosophy photography phrase physical physician
physics piano picnic picture pilgrimage planet plantation plastic platform pleasure poem poet poetry police policy
pollution population portrait position possession poverty power practice praise preference premise prescription
presentation pressure prevention price prince principle printing priority prison privacy privilege prize problem
procedure process production profession professor profit program programme progress project promise pronunciation
property proposal prospect protection proverb province psychology publication publicity punishment pupil purchase
purpose pyramid qualification quality quantity quarantine question questionnaire queue quotation race radiation
railway rainfall rate reaction reading reality reason recession recipe recognition recommendation record recovery
recreation recycle reduction reflection reform refugee region rejection relationship relaxation relief religion
remedy removal rent repair repetition replacement report representation reputation requirement rescue research
reservation residence resident resistance resource respect restaurant restriction result retirement revenue review
revolution reward rhythm rice risk river robot rock role romance roof route routine rubbish rugby rule rumor rumour
rural safety salary sale sample satisfaction scene scenery schedule scholarship school science sculpture season
seat second secretary section sector security seed selection self seminar senior sense sentence series service
session settlement shelter shortage sightseeing signal signature silence silver similarity singer situation skill
slavery sleep slogan smoke society sociology software soil solution song sound source space speed spelling sport
staff stage standard starvation statement station statistics statue status steak stimulus stock stomach stone
storage story strategy stress structure student studio stuff style subject substance suburb success sugar suggestion
summer supermarket supply surface surgery surprise survey survival sustainability sweat symbol system table tablet
talent target task taste tax teacher team technology teenager telephone temperature tennis tension term terminal
territory test text theatre theater theme theory therapy thief thinking threat thunder ticket tide time timetable
tip tissue title tobacco tone tool topic total tour tourism tourist tournament tower town toy trade tradition traffic
training transfer transformation transition translation transport travel treasure treatment tree trend trial tribe
trick trip trouble truck trust truth tuition tumour tumor tunnel tutor type tyre tire typical unemployment uniform
union unit university update upgrade usage utility vacation valley value variety vegetable vehicle version victim
video view village violence vision visitor vocabulary voice volume volunteer vote wage wage wall war warehouse
warning waste watch water wealth weapon weather website wedding weight welfare wheat wildlife wind window wine
wisdom wolf woman wood wool word work worker workshop world worry wound writing yard youth zone

ability absence absolute abuse acceleration acceptance access accident accommodation account achievement acid
acquaintance activity addition address adjustment admiration admission adoption adulthood advantage adventure
advertisement advice affection afternoon age agency agenda agreement aid aim air airport aisle alarm album alcohol
alley alliance allowance almond alphabet altitude aluminium aluminum ambition ambulance amendment amount amusement
analysis ancestor anchor anger angle animal ankle answer apartment apology appeal appearance apple applicant appointment
appreciation approval architect architecture archive arena arm army arrangement arrival art article artist aspect
assault assembly assessment asset assistance association assumption athlete atlas atom attachment attack attempt
attention attitude auction aunt author authority autumn avenue award awareness baby background bacteria badge
bag baggage bakery balance balcony ballot band bank bar barrier base basement basis basket bath battery battle bay
beach bean bear beard beast beat beauty bed bedroom bee beer beginning behaviour being belief bell belly belt bench
bend benefit berry bicycle bid bike bill bin biology bird birth birthday biscuit bishop bite black blackboard blade
blank blanket blast blend blessing blind block blood blouse board boat body boil bone book boot border bore boss
bottle bottom boundary bowl box boy brain branch brand brass bread break breakfast breast breath brick bride bridge
briefcase brother brush bucket bud budget buffer bug building bulb bull bunch burden bus bush business butter
button buyer cabbage cabin cabinet cable cafe cage cake calculation calendar call calm camera camp campaign campus
canal cancellation cancer candidate candle candy cap capital captain capture car carbon card care career carpet
carriage carrot cartoon case cash castle cat catalogue category cattle cause cave ceiling celebration cell cellar
cent centre center century cereal ceremony certainty chain chair chairman chalk chamber champion championship
chance change chapter character charge charity chart chase chat check cheek cheese chef chemical cheque cherry
chess chest chicken chief child childhood chimney chin chocolate choice choir choke church cigarette cinema circle
circuit circulation citizen city claim class classroom clay clean cleaner client cliff climate clinic clock close
cloth clothes clothing cloud club coach coal coast coat code coffee coin cold collection college colour color
comb combination comfort command comment commercial commission committee common communication company comparison
compensation competition complaint completion complex compound comprehension computer concern concert conclusion
concrete condition conference confidence confirmation conflict confusion congratulations connection conscience
consciousness consequence conservation consideration consortium constitution construction consultation consumer
contact container content contest context continent contract contrast contribution control convenience conversation
conversion cook cookie cooperation coordination copper copy corn corner corporation correction corridor cost
costume cottage cotton couch cough council count counter country countryside county couple courage course court
cousin cover cow craft crash cream creation creature credit crew crime crisis criterion critic crop cross crowd
crown cruise cry crystal cube cucumber culture cup cupboard cure curiosity currency current curtain curve cushion
custom customer cut cycle dad daily damage dance danger date daughter dawn day dead deadline deaf deal dear death
debt decade decision deck declaration decline decoration decrease deed deep deer defeat defence defense deficit
definition degree delay delegate deletion delivery demand democracy demonstration denial density department departure
dependence deposit depression depth deputy description desert design desire desk destination destruction detail
detective determination development device devil diagram dial dialogue diamond diary dictionary diet difference
difficulty digestion dignity dinner direction director dirt disability disagreement disaster discipline discount
discovery discussion disease dish disk dislike dismissal disorder display dispute distance distinction distribution
district ditch divide division divorce doctor document dog dollar door dose dot doubt down download dozen draft
dragon drama drawer dream dress drink drive driver drop drug drum duck due dumpling dust duty ear earth earthquake
east economics economy edge edition editor education effect efficiency effort egg election electricity element
elephant elevator elimination emergency emotion emperor emphasis empire employee employer employment emptiness
encouragement end enemy energy engine engineer engineering entertainment enthusiasm entrance entry envelope
environment episode equality equipment equivalent era error escape essay establishment estate estimate evaluation
evening event evidence evolution exam examination example exception exchange excitement excuse execution exercise
exhaust exhibition exile existence expansion expectation expedition expenditure experience experiment expertise
explanation explosion export exposure extension extent external extraction extra eye face facility fact factor
factory failure faith fall fame family famine fan fantasy fare farm farmer fashion fate father fault favour favor
fear feather feature federal fee feedback feeling fellow female fence ferry fertilizer festival fever fibre fiber
fiction field fight figure file film filter final finance finding finger fire firm fish fisherman fist fit flag
flat flavour flavor flesh flight flood floor flour flow flower flu fluid fly focus fog fold folder folk following
food foot football force forecast forehead foreign foreigner forest forgery fork form formation formula fortune
forum foundation fountain fox frame framework freedom freeze frequency fridge friend friendship frog front frost
fruit fuel function fund funeral furniture future gain gallery game gang gap garage garden garlic gas gate
gathering gear gender gene generation genius gentleman geography gesture ghost giant gift ginger girl glacier
glance glass glimpse global globe glory glove glue goal goat god gold golf good goods gossip government governor
grab grade grain grammar grandchild grandfather grandmother grass gratitude gravity gray grey great green greeting
grey grief grocery ground group growth guarantee guard guess guest guidance guide guideline guilt guitar gun guy
gym habit habitat hair half hall ham hammer hand handle handwriting hang happiness harbor harbour harm harvest
hat hate head headache headline health heap heart heat heaven height helicopter hell helmet help hen herb herd
hero heroine hesitation hide hierarchy highland highway hike hill hint hip hire history hit hobby hold hole holiday
home homework honey honour honor hook hope horizon horn horse hospital host hostel hotel hour house household
housing human humanity humour humor hunger hurricane hurry husband hut hydrogen hypothesis ice idea identity
idiom ignorance illness illusion illustration image imagination imitation immigrant immigration impact implication
importance impression improvement impulse inability inch incident income increase independence index indication
individual industry infancy infection inflation influence information ingredient inheritance initiative injury
injustice ink inn innovation input inquiry insect insertion insight inspection inspector inspiration installation
instance instinct institute institution instruction instrument insurance intake intelligence intention interaction
interest interference interior interpretation interval interview introduction invasion invention investment
investigation invitation involvement iron irony island isolation issue item jacket jail jam jar jaw jazz jeans
jelly jet jewel job joint joke journal journalist journey joy judge judgement judgment juice jump junction jungle
junior jury justice justification keen kettle key keyboard kick kid kidney kill kilogram kilometre kilometer
kindergarten kindness king kingdom kiss kit kitchen kite kitten knee knife knight knock knot knowledge label
laboratory labour labor lack ladder lady lake lamb lamp land landscape lane language lap laptop large laser last
laughter launch law lawyer layer layout lazy lead leader leaf league leak lean leap leather leave lecture left
leg legal legend legislation leisure lemon length lesson letter level liability library licence license lid lie
life lifestyle lift light lightning limit line link lion lip liquid list literature litre liter litter little
live load loaf loan lobby local location lock log logic loneliness long look loop lord lorry loss lot lounge
love luck luggage lunch lung machine machinery magazine magic mail main mainland major majority maker mall man
management manager manner manufacture manuscript map marble march margin mark market marriage master mat match
material matter maximum mayor meal meaning measure meat mechanic medal media medicine medium meeting melon
member membership memory mention menu merchant mercy merit mess message metal method metre meter microphone
microscope middle midnight mile milk mill mine mineral minimum minister ministry minor minority minute miracle
mirror missile mission mistake mixture mobile mode model modem moment money monitor monkey month moon moral
morning mortgage mother motion motivation motor mount mountain mouse mouth move movement movie mud mug
multimedia murder muscle museum mushroom music musician mustard mystery myth nail name napkin nation national
nationality native nature navy near neck necklace need needle negative neglect negotiation neighbour neighbor
neighbourhood neighborhood nephew nerve nest net network news newspaper niece night noise noodle noon normal
north nose note notebook nothing notice notion novel nurse nut nutrition oak object objective obligation
observation obstacle occasion occupation occurrence ocean odd odour odor offence offense offer office officer
official oil old olive onion opening opera operation opinion opponent opportunity opposition optimism option
orange orbit orchestra order organ organisation organization origin original outcome outdoor outline output
outset oven overall owner ownership pace pack package packet page pain paint painter painting pair palace pale
palm pan panel panic paper parade paragraph parcel pardon parent park parliament part participation particular
partner party passage passenger passion passport past pasta path patience patient pattern pause pavement pay
payment pea peace peach peak pear peasant peculiar pedal pen penalty pencil pension people pepper per cent
percent percentage perception perfume period permission permit person personality personnel perspective
persuasion pessimist pet petrol phase phenomenon philosophy phone photo photograph photographer phrase physical
physician physics piano pick picnic picture pie piece pig pile pill pillow pilot pin pine pink pioneer pipe
pistol pit pitch pity place plain plan plane planet plant plantation plastic plate platform play player
playground plea pleasure pledge plenty plot plug plus pocket poem poet poetry point poison pole police policeman
policy polish politician politics pollution pond pool poor pop popular popularity population pork port portion
portrait position positive possession possibility post postcode poster pot potato potential pottery pound pour
poverty powder power practice praise pray prayer precision predict prediction preface preference pregnancy
prejudice preparation prescription presence presentation preservation president press pressure prestige
presumption pretty prevention price pride priest primary prince princess principal principle print printer
priority prison prisoner privacy privilege prize probability problem procedure proceed process procession
produce producer product production profession professional professor profile profit program programme
progress prohibition project promise promotion prompt pronoun pronunciation proof proper property proportion
proposal prospect prosperity protection protein protest proud prove proverb provide province provision
psychology pub publication publicity publisher pull pump punch punishment pupil purchase pure purple purpose
purse pursue push puzzle qualification quality quantity quarter queen question queue quick quiet quiz quotation
quote rabbit race racket radar radiation radio radius rail railway rain rainbow raise range rank rapid rare
rat rate rather ratio raw ray razor reach reaction reader reality realm reason receipt reception recession
recipe recognition recommendation record recording recovery recreation recruit rectangle recycle reduction
refectory referee reference refinery reflection reform refreshment refuge refugee refund refusal regard regime
region register registration regret regulation rehearsal reign relation relationship relative relativity
relaxation release relief religion reluctance remainder remark remedy reminder removal rent repair repetition
replacement reply report reporter representation representative reputation request requirement rescue research
resemblance reservation reserve residence resident resignation resistance resolution resort resource respect
response responsibility rest restaurant restoration restriction result resume retail retirement retreat
return reunion revelation revenge revenue reverse review revision revolution reward rhythm rib ribbon rice
richness rid ride rifle right ring rise risk ritual rival river road roast rob robot rock rocket role roll
roof room root rope rose rotation rough round route routine row royal rubber rubbish rugby ruin rule rumour
rumor run rural rush sack sacrifice sad saddle safety sail sailor salary sale salt salvation sample sand
satellite satisfaction sauce sausage save saving saw scale scandal scar scenery schedule scheme scholar
scholarship school science scientist scissors score scratch scream screen script sculpture sea seal search
season seat second secret secretary section sector security seed seek segment seize selection self sell
semester seminar senate sensation sense sensitivity sensor sentence separation sequence series servant
service session settlement settler shade shadow shake shall shallow shame shape share shark sharp shave shed
sheep sheet shelf shell shelter shift shine ship shirt shock shoe shoot shop shopping shore short shortage
shot shoulder shout show shower shrimp shrink shut shuttle shy sick side siege sight sign signal signature
significance silence silk silly silver similarity simplicity sin singer single sink sir sister site situation
size skate ski skill skin skirt sky slave sleep sleeve slice slide slight slip slogan slope slot slow small
smart smell smile smoke smooth snack snake snow soap social society sock sofa soft software soil soldier
sole solid solution solve some somebody someone something sometimes son song soon sorrow sort soul sound
soup source south space spare spark speaker special specialist species specific specimen spectacle spectator
speech speed spell spelling spend sphere spider spill spin spirit spiritual spite splendid split spoil
spokesman spoon sport spot spray spread spring sprint square squeeze stability stable stadium staff stage
stair stake stamp stand standard star stare start starvation state statement station statistics statue
status stay steady steak steal steam steel steep step stereotype stick stiff still stimulate sting stock
stomach stone stool stop storage store storm story stove straight strain strange stranger strategy straw
stream street strength stress stretch strict strike string strip stroke strong structure struggle student
studio study stuff style subject submit subsequent substance substitute suburb succeed success succession
such sudden suffer sufficient sugar suggest suggestion suitable sum summary summer summit sun super superb
superior supermarket supper supply support supporter suppose supreme sure surface surgeon surgery surprise
surround survey survival survive suspect suspicion swallow swap swear sweat sweep sweet swim swing switch
symbol sympathy symptom system table tablet tackle tag tail tailor take tale talent talk tank tap tape target
task taste tax taxi tea teach teacher team tear technique technology teenager teeth telephone telescope
television tell temper temperature temple temporary tempt tenant tend tendency tender tennis tension tent
term terminal terrible territory terror test text textbook texture than thank theatre theater theme theory
therapy there therefore thesis thick thief thin thing think thinking third thirst this thorough those though
thought threat threaten throat through throughout throw thumb thunder thus ticket tide tidy tie tight till
timber time timetable timid tin tiny tip tire tired tissue title toast tobacco today toe together toilet
tolerance tolerate tomato tomorrow ton tone tongue tonight too tool tooth top topic total touch tough tour
tourism tourist tournament towel tower town toy trace track trade tradition traffic tragedy trail train
training trait transfer transform transition translate translation transmit transport trap travel tray
treat treatment treaty tree trend trial triangle tribe trick trigger trip triumph troop trouble trousers
truck true trust truth try tube tune tunnel turkey turn tutor twin twist type tyre tire typical tyre ugly
ultimate umbrella unable uncle uncomfortable uncover under underestimate undergo undergraduate underground
underline undermine understand undertaking underwear undo unemployment unexpected unfair unfortunate
uniform unify union unique unit unite universal universe university unless unlike unlikely unnecessary
unpleasant until unusual update upgrade upset upstairs urban urge urgent usage use useful useless user
usual utility vacant vacation vacuum vague vain valid valley valuable value van vanish variable variation
variety various vary vast vegetable vegetarian vehicle veil venture venue verb verdict verify version
vertical vessel veteran via vice victim victory video view viewer village vinegar violence violent violin
virtual virtue virus visa vision visit visitor visual vital vitamin vivid vocabulary voice volume voluntary
volunteer vote voter voyage vulnerable wage wagon waist wait waiter wake walk wall wallet wander want war
ward wardrobe warehouse warm warn warning wash washing waste watch water wave way weak weakness wealth
weapon wear weather weave web wedding weed week weekend weigh weight weird welcome welfare well west wet
whale what wheat wheel when where whereas wherever whether which while whip whisper whistle white who
whole whom whose why wide widespread widow width wife wild wildlife willing win wind window wine wing
winner winter wipe wire wisdom wise wish wit withdraw within without witness wolf woman wonder wood
woolen wooden wool word work worker workforce workman workshop world worm worry worse worship worst
worth worthy wound wrap wrist write writer writing wrong yard yawn year yellow yes yesterday yet yield
you young youth zebra zero zone zoo
`.trim().replace(/\n/g, ' ').split(/\s+/).filter(Boolean);

// 去重、只留 3 个字母以上
const CORE_SET = new Set(CORE.filter((w) => /^[a-z]+$/.test(w) && w.length >= 3));

// 学术后缀：不在词表里但形态上很像学术词的，给一点加成
const ACADEMIC_SUFFIX = /(tion|sion|ment|ity|ance|ence|ology|graphy|ism|ous|ive|able|ible|al|ic)$/;

const STOP = new Set((
`a an the and or but if then than that this these those there here of to in on at by for with from as is are was
were be been being am do does did done have has had having will would can could may might must should shall i
you he she it we they me him her us them my your his its our their who whom which what when where why how not no
nor so very too also just only even still such more most much many few some any all both each other another
about above after again against because before below between during into through under until up down out over
off once own same so than then though upon while one two three four five six seven eight nine ten yes oh ok okay
get got go goes going went come came make made take took see saw say said know knew think thought want wanted
like liked look looked use used find found give gave tell told work worked call called try tried ask asked need
needed feel felt become became leave left put put mean meant keep kept let begin began seem seemed help helped
show showed hear heard play played run ran move moved live lived believe believed hold held bring brought happen
happened write wrote sit sat stand stood lose lost pay paid meet met include included continue continued set set
learn learned change changed lead led understand understood watch watched follow followed stop stopped create
created speak spoke read read allow allowed add added grow grew open opened walk walked win won offer offered
remember remembered love loved consider considered appear appeared buy bought wait waited serve served die died
send sent expect expected build built stay stayed fall fell cut cut reach reached kill killed remain remained
suggest suggested raise raised pass passed sell sold require required report reported decide decided pull pulled
`
).split(/\s+/).filter(Boolean));

function tokenizeWords(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z'\- ]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^[-']+|[-']+$/g, ''))
    .filter((w) => w.length >= 3 && !STOP.has(w) && /^[a-z]+$/.test(w));
}

/**
 * 给一篇素材里的单词打分排序
 * @param {Array<{id,text,zh,bestScore,lastScore}>} segments
 * @param {Object} opts
 * @returns {Array<{word, count, sentence, senZh, segId, score, weight}>}
 */
function rankWords(segments, { minLen = 3, limit = 400, level = 3 } = {}) {
  const map = new Map();
  for (const seg of segments || []) {
    const words = tokenizeWords(seg.text);
    const segScore = seg.bestScore || seg.lastScore || 0;
    for (const w of words) {
      if (w.length < minLen) continue;
      let item = map.get(w);
      if (!item) {
        item = { word: w, count: 0, sentence: seg.text, senZh: seg.zh || '', segId: seg.id, score: segScore || 100 };
        map.set(w, item);
      }
      item.count += 1;
      if (segScore && segScore < item.score) item.score = segScore;
      if (!item.sentence) item.sentence = seg.text;
      if (!item.senZh) item.senZh = seg.zh || '';
    }
  }

  const list = [...map.values()].map((it) => {
    let weight = 0;
    if (CORE_SET.has(it.word)) weight += 42;          // 雅思/四级高频词
    else if (ACADEMIC_SUFFIX.test(it.word)) weight += 16; // 学术词形态
    weight += Math.min(24, it.count * 5);              // 正文复现
    weight += Math.min(18, Math.max(0, it.word.length - 5) * 2); // 词越长越难
    if (it.score && it.score < 75) weight += 26;       // 跟读读不准的词
    if (it.score && it.score < 60) weight += 14;
    // 纯短小虚词沉底
    if (it.word.length <= 4 && !CORE_SET.has(it.word)) weight -= 6;

    // 取词难度：0 = 基础（1000–2000 词量），9 = 英语专业（20000–26000 词量）
    // 用「长度 + 学术词形态 + 词表层级」估一个 1–4.5 的难度，再和用户选的档位对齐
    const lv = Math.max(0, Math.min(9, parseInt(level, 10) || 0));
    const diff = 1
      + Math.min(2.2, Math.max(0, it.word.length - 4) / 4.5)
      + (ACADEMIC_SUFFIX.test(it.word) ? 0.8 : 0)
      + (CORE_SET.has(it.word) ? 0.2 : 1.0);
    const target = 1 + lv * 0.39;
    weight += Math.max(0, 40 - Math.abs(diff - target) * 24) * 1.6;
    return { ...it, weight };
  });

  list.sort((a, b) => b.weight - a.weight || a.word.localeCompare(b.word));
  return list.slice(0, limit);
}

module.exports = { rankWords, tokenizeWords, CORE_SET };

/* ------------------------------------------------------------------ */
/* 背生词用的辅助：派生词 + 联想记忆                                     */
/* ------------------------------------------------------------------ */

const PREFIX = {
  un: '不、相反', in: '不、向内', im: '不、向内', il: '不', ir: '不', dis: '否定、分开', mis: '错误地',
  re: '再、回', pre: '预先', pro: '向前、赞成', post: '之后', con: '共同、一起', com: '共同、一起',
  sub: '在下、次级', super: '超过', trans: '跨越、转变', inter: '之间', intra: '内部', over: '过度、在上',
  under: '不足、在下', anti: '反对', auto: '自己', bio: '生命', geo: '地球', tele: '远', micro: '微小',
  multi: '多', mono: '单一', semi: '一半', co: '共同', de: '向下、去除', ex: '向外、前', en: '使…', em: '使…',
  ad: '朝向', ac: '朝向', af: '朝向', per: '贯穿', sur: '在上', out: '超过', up: '向上', non: '非',
};

const SUFFIX_MEAN = {
  tion: '名词：动作或状态', sion: '名词：动作或状态', ment: '名词：行为或结果', ity: '名词：性质',
  ness: '名词：性质', ance: '名词：状态', ence: '名词：状态', ous: '形容词：…的', ive: '形容词：有…性质的',
  able: '形容词：能…的', ible: '形容词：能…的', al: '形容词：…的', ic: '形容词：…的', ize: '动词：使…化',
  ise: '动词：使…化', fy: '动词：使…', ly: '副词', er: '名词：人或物', or: '名词：人或物', ist: '名词：人',
  ism: '名词：主义、体系', ology: '名词：学科', graphy: '名词：记录、学科', ship: '名词：状态、关系',
  hood: '名词：状态', less: '形容词：没有…的', ful: '形容词：充满…的', ing: '动名词 / 进行', ed: '过去 / 被…的',
  ward: '副词：向…方向', en: '动词：使…',
};

const STRIP_SUFFIX = [
  'ation', 'ition', 'ution', 'tion', 'sion', 'ment', 'ity', 'ness', 'ance', 'ence', 'ously', 'ous',
  'ively', 'ive', 'ably', 'able', 'ibly', 'ible', 'ally', 'al', 'ic', 'ize', 'ise', 'ify', 'fy',
  'ers', 'er', 'ors', 'or', 'ists', 'ist', 'ism', 'ing', 'ed', 'ies', 'ly',
];

function baseStems(word) {
  const w = String(word || '').toLowerCase();
  const out = new Set([w]);
  for (const suf of STRIP_SUFFIX) {
    if (w.length - suf.length >= 4 && w.endsWith(suf)) {
      const s = w.slice(0, w.length - suf.length);
      out.add(s);
      out.add(s + 'e');
      out.add(s + 'y');
    }
  }
  return [...out];
}

/** 派生词：从核心词表里找同词根的词（signify / significant / significance …） */
function wordFamily(word, limit = 6) {
  const w = String(word || '').toLowerCase();
  const stems = baseStems(w);
  const hits = [];
  for (const cand of CORE_SET) {
    if (cand === w) continue;
    for (const s of stems) {
      if (s.length < 4) continue;
      if (!cand.startsWith(s) && !cand.startsWith(s.slice(0, Math.max(4, s.length - 1)))) continue;
      const diff = Math.abs(cand.length - w.length);
      if (diff > 8 && !cand.startsWith(s)) continue;
      hits.push({ word: cand, stem: s });
      break;
    }
  }
  const seen = new Set();
  return hits
    .sort((a, b) => b.stem.length - a.stem.length || a.word.length - b.word.length)
    .filter((h) => (seen.has(h.word) ? false : (seen.add(h.word), true)))
    .slice(0, limit)
    .map((h) => h.word);
}

/** 联想记忆：拆词缀 + 中文释义串起来 */
function mnemonic(word, zh = '') {
  const w = String(word || '').toLowerCase();
  let pre = '';
  let preZh = '';
  for (const p of Object.keys(PREFIX)) {
    if (w.length > p.length + 3 && w.startsWith(p)) {
      if (!pre || p.length > pre.length) { pre = p; preZh = PREFIX[p]; }
    }
  }
  let suf = '';
  let sufZh = '';
  for (const s of Object.keys(SUFFIX_MEAN)) {
    if (w.length > s.length + 3 && w.endsWith(s)) {
      if (!suf || s.length > suf.length) { suf = s; sufZh = SUFFIX_MEAN[s]; }
    }
  }
  const core = w.slice(pre ? pre.length : 0, suf ? w.length - suf.length : w.length);
  const parts = [];
  if (pre) parts.push(`${pre}-（${preZh}）`);
  if (core) parts.push(core);
  if (suf) parts.push(`-${suf}（${sufZh}）`);
  const lines = [];
  if (pre || suf) {
    lines.push(`构词：${parts.join(' + ')}`);
    if (zh) lines.push(`联想：${core || w} 加上词缀后，就是「${zh}」`);
  } else if (zh) {
    lines.push(`联想：先念准 ${w} 的重读音节，再把它和「${zh}」绑在一起记`);
  } else {
    lines.push(`联想：跟读时把重读音节和中文意思一起念，形成口型记忆`);
  }
  return lines.join('；');
}

module.exports.wordFamily = wordFamily;
module.exports.mnemonic = mnemonic;
