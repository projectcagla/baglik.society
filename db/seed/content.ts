// Seed content transcribed from the club's own editorial files:
//   001_drive_my_car_short_reading.pdf   (1 page, "ileri okuma & izleme")
//   002_canavar_pre_reading_mobile.pdf   (5 pages, "gösterim öncesi")
// Titles, authors, outlets, years and URLs were taken from the PDFs' text and
// link annotations. Nothing is invented: fields the PDFs do not state
// (runtime, country, intro, spoiler level for 001, screening date of 001) are
// left empty for the editor. Turkish notes are the curator's original short
// summaries, not translations. Links start as "denetlenmedi" (unchecked) —
// the link checker verifies them from the deployed app.

export interface SeedResource {
  layer: 'once' | 'sonra';
  section: 'okuma' | 'izleme' | 'eslik';
  kind:
    | 'article'
    | 'interview'
    | 'video'
    | 'podcast'
    | 'music'
    | 'essay'
    | 'book'
    | 'film'
    | 'official'
    | 'other';
  heading?: string;
  title_original?: string;
  author?: string;
  publication?: string;
  form_label?: string;
  language?: string;
  published_year?: number;
  duration_note?: string;
  url: string;
  link_label?: string;
  link_hint?: string;
  access_note?: string;
  spoiler_level: 'yok' | 'hafif' | 'var' | 'belirtilmedi';
  note?: string;
  prompt?: string;
  rights_status: 'baglanti' | 'ozgun_ozet';
  /** open question for the editor; shown in the desk queue, never to members */
  review_note?: string;
}

// 001's PDF is the early selection (a Murakami book, a Chekhov play, film
// recommendations). The club later settled on a minimalist article/interview
// version that is not in this repository, so those rows wait for the editor.
const DMC_EARLY =
  'erken PDF seçkisinden (kitap / film önerisi). sonraki makale–söyleşi ağırlıklı minimalist sürümle karşılaştırılmalı; o dosya henüz sisteme eklenmedi.';

export interface SeedFilm {
  program_no: number;
  slug: string;
  title: string;
  title_original: string;
  year: number;
  director: string;
  status: 'oneri' | 'secildi' | 'yaklasiyor' | 'izlendi' | 'arsiv';
  curator_credit: string;
  reading_label: string;
  /** the editorial file the rows were transcribed from (recorded as provenance) */
  source_file: string;
  after_published: boolean;
  resources: SeedResource[];
  questions: { layer: 'once' | 'sonra'; body: string }[];
}

export const films: SeedFilm[] = [
  {
    program_no: 1,
    slug: '001-drive-my-car',
    title: 'drive my car',
    title_original: 'Drive My Car',
    year: 2021,
    director: 'Ryūsuke Hamaguchi',
    status: 'izlendi',
    curator_credit: 'çağla aytaç dursun',
    reading_label: 'ileri okuma & izleme',
    source_file: '001_drive_my_car_short_reading.pdf',
    after_published: true,
    resources: [
      {
        layer: 'once',
        section: 'okuma',
        kind: 'book',
        review_note: DMC_EARLY,
        title_original: 'Men Without Women',
        author: 'Haruki Murakami',
        form_label: 'öykü derlemesi',
        url: 'https://www.penguinrandomhouse.com/books/547925/men-without-women-by-haruki-murakami/',
        link_label: 'kaynak',
        spoiler_level: 'belirtilmedi',
        note: 'Önce “Drive My Car”; ardından “Şehrazad” ve “Kino”.',
        rights_status: 'baglanti',
      },
      {
        layer: 'once',
        section: 'okuma',
        kind: 'book',
        review_note: DMC_EARLY,
        heading: 'Vanya Dayı',
        author: 'Anton Çehov',
        form_label: 'tiyatro',
        url: 'https://www.gutenberg.org/ebooks/1756',
        link_label: 'kaynak',
        spoiler_level: 'belirtilmedi',
        note: 'Oyunun finalini filmdeki sahneyle birlikte düşün.',
        rights_status: 'baglanti',
      },
      {
        layer: 'once',
        section: 'okuma',
        kind: 'essay',
        title_original: 'Drive My Car: Grace Notes',
        author: 'Bryan Washington',
        publication: 'Criterion',
        language: 'en',
        url: 'https://www.criterion.com/current/posts/7872-drive-my-car-grace-notes',
        link_label: 'kaynak',
        spoiler_level: 'belirtilmedi',
        note: 'Uyarlama, yas ve bir başkasını tanımanın sınırları.',
        rights_status: 'baglanti',
      },
      {
        layer: 'once',
        section: 'izleme',
        kind: 'film',
        review_note: DMC_EARLY,
        title_original: 'Wheel of Fortune and Fantasy',
        author: 'Ryūsuke Hamaguchi',
        published_year: 2021,
        url: 'https://filmmovement.com/product/wheel-of-fortune-and-fantasy',
        link_label: 'kaynak',
        spoiler_level: 'belirtilmedi',
        note: 'Konuşmak, susmak ve yanlış anlaşılmak üzerine üç öykü.',
        rights_status: 'baglanti',
      },
      {
        layer: 'once',
        section: 'izleme',
        kind: 'film',
        review_note: DMC_EARLY,
        title_original: 'After Life',
        author: 'Hirokazu Kore-eda',
        published_year: 1998,
        url: 'https://www.criterion.com/films/29081-after-life',
        link_label: 'kaynak',
        spoiler_level: 'belirtilmedi',
        note: 'Hatırlamak ve geçmişten bir an seçmek üzerine.',
        rights_status: 'baglanti',
      },
    ],
    questions: [
      {
        layer: 'sonra',
        body: 'Bir başkasını gerçekten tanımak için onun bütün hikâyesini bilmek gerekir mi?',
      },
    ],
  },
  {
    program_no: 2,
    slug: '002-canavar',
    title: 'canavar',
    title_original: 'Monster',
    year: 2023,
    director: 'Hirokazu Kore-eda',
    status: 'yaklasiyor',
    curator_credit: 'çağla aytaç dursun',
    reading_label: 'gösterim öncesi',
    source_file: '002_canavar_pre_reading_mobile.pdf',
    after_published: false,
    resources: [
      {
        layer: 'once',
        section: 'okuma',
        kind: 'article',
        heading: 'Gündelik hayatın ayrıntıları',
        title_original: 'Where to begin with Hirokazu Koreeda',
        author: 'Leigh Singer',
        publication: 'BFI',
        language: 'en',
        published_year: 2016,
        url: 'https://www.bfi.org.uk/features/where-begin-hirokazu-koreeda',
        link_label: 'orijinal makaleyi aç',
        link_hint: 'kaynak site üzerinden okunur',
        spoiler_level: 'yok',
        note:
          'Leigh Singer’ın yazısı, Kore-eda sinemasında aile ilişkilerinin gündelik hayat üzerinden nasıl kurulduğunu anlatıyor. Birlikte yemek yemek, beklemek veya susmak gibi sıradan hareketler, karakterler hakkında doğrudan açıklamalardan daha fazla şey söyleyebiliyor.\n\n' +
          'Yönetmenin belgesel geçmişi de bu gözlemci yaklaşımın bir parçası. Özellikle çocuk oyuncularla çalışırken sahneyi tüm ayrıntılarıyla önceden ezberletmek yerine, yaşadıkları duruma tepki vermelerine alan tanıdığı aktarılıyor. Bu yöntem, karakterleri tek bir duyguyla tanımlamak yerine davranışlarını izlemeyi öne çıkarıyor.',
        rights_status: 'ozgun_ozet',
      },
      {
        layer: 'once',
        section: 'okuma',
        kind: 'essay',
        heading: 'Bir başkasının iç dünyası',
        title_original: 'On the Novelistic Afterlife of After Life',
        author: 'Hirokazu Kore-eda',
        publication: 'Criterion',
        language: 'en',
        published_year: 2021,
        url: 'https://www.criterion.com/current/posts/7515-on-the-novelistic-afterlife-of-after-life',
        link_label: 'orijinal makaleyi aç',
        link_hint: 'kaynak site üzerinden okunur',
        spoiler_level: 'yok',
        note:
          'Kore-eda bu metinde, belgesel yönetmenliğinin kendisine kazandırdığı bir sınırdan söz ediyor: Kamera karşısındaki insanların iç dünyasını bütünüyle bildiğini varsaymamak. Bir insanın ne hissettiğini açıklamakla, onun davranışlarına dikkatle bakmak aynı şey değil.\n\n' +
          'After Life filmini daha sonra romana dönüştürme deneyimi bu ayrımı belirginleştiriyor. Yazı, sinemanın dışarıdan gözlemlediği bir karakterin zihnine girebilmesine olanak tanıyor. Kore-eda için iki anlatım biçimi birbirini tekrar etmek zorunda değil; aynı hikâyeyi farklı açılardan anlamanın yolları.',
        prompt: 'Bir karaktere yaklaşmak, onu açıklamak anlamına gelir mi?',
        rights_status: 'ozgun_ozet',
      },
      {
        layer: 'once',
        section: 'okuma',
        kind: 'interview',
        heading: 'Hafızanın bugünü',
        title_original: 'Hirokazu Kore-eda’s Parisian Rendezvous',
        author: 'Hillary Weston',
        publication: 'Criterion',
        language: 'en',
        published_year: 2020,
        url: 'https://www.criterion.com/current/posts/7022-hirokazu-kore-eda-s-parisian-rendezvous',
        link_label: 'orijinal makaleyi aç',
        link_hint: 'kaynak site üzerinden okunur',
        spoiler_level: 'yok',
        note:
          'Hillary Weston’ın söyleşisi, Kore-eda’nın oyuncularla kurduğu ilişkinin senaryoyu nasıl değiştirebildiğine odaklanıyor. Yönetmen, konuşmalar ve provalar sırasında ortaya çıkan ayrıntıları metne katıyor; bazen bir bakışın söyleyebileceği şeyi diyalogdan çıkarıyor.\n\n' +
          'Söyleşide hafıza için yaptığı ayrım da önemli. Hatırlamak, geçmişi değişmeden saklayan bir kayıt değil; geçmişe bugünden yeniden bakma eylemi. Bu nedenle insanlar aynı olayı farklı zamanlarda başka türlü anlatabiliyor. Kore-eda’nın anlatılarında söylenenler kadar, bir şeyin nasıl hatırlandığı da anlam kazanıyor.',
        prompt: 'Bir anı, anlatıldığı zamana göre değişir mi?',
        rights_status: 'ozgun_ozet',
      },
      {
        layer: 'once',
        section: 'okuma',
        kind: 'interview',
        heading: 'Ailenin sınırları',
        title_original: 'Hirokazu Koreeda on Broker',
        author: 'Lou Thomas',
        publication: 'BFI',
        language: 'en',
        published_year: 2023,
        url: 'https://www.bfi.org.uk/interviews/hirokazu-koreeda-broker-im-interested-this-innate-human-desire-form-familial-unit',
        link_label: 'orijinal makaleyi aç',
        link_hint: 'kaynak site üzerinden okunur',
        spoiler_level: 'yok',
        note:
          'Lou Thomas’ın söyleşisinde Kore-eda, aileyi yalnızca kan bağına dayanan bir yapı olarak ele almadığını anlatıyor. Yakınlık, birlikte yaşanan deneyimler ve karşılıklı sorumluluklar da insanları birbirine bağlayabiliyor. Bu yaklaşım, yönetmenin filmlerinde tekrar eden aidiyet meselesini görünür kılıyor.\n\n' +
          'Söyleşi ayrıca çocukların ve kadınların toplumsal açıdan kırılgan konumlarına duyduğu ilgiyi açıyor. Kore-eda’nın karakterlerine yaklaşımında tek bir davranışın ötesine geçmek; yaşadıkları koşulları, yakın ilişkileri ve toplumun onlardan beklentilerini birlikte düşünmek önemli bir yer tutuyor.',
        prompt: 'Bir ilişkiyi aile yapan şey nedir?',
        rights_status: 'ozgun_ozet',
      },
      {
        layer: 'once',
        section: 'eslik',
        kind: 'official',
        heading: 'Yaratıcı ekip',
        publication: 'Cannes',
        form_label: 'kısa haber',
        url: 'https://www.festival-cannes.com/en/2023/monster-kore-eda-returns/',
        link_label: 'resmî metin',
        link_hint: 'kısa konu bilgisi içerir',
        spoiler_level: 'hafif',
        note: 'Kore-eda, senaryoda Yuji Sakamoto ve müzikte Ryuichi Sakamoto ile çalışıyor. Cannes’ın kısa tanıtımı yaratıcı ekibe ilişkin temel bilgileri içeriyor; ayrıca filmin konusuna kısaca değiniyor.',
        rights_status: 'ozgun_ozet',
      },
      {
        layer: 'once',
        section: 'eslik',
        kind: 'music',
        heading: 'Ryuichi Sakamoto — 12',
        title_original: '12',
        author: 'Ryuichi Sakamoto',
        form_label: 'albüm',
        published_year: 2023,
        url: 'https://ryuichisakamoto.lnk.to/twelve',
        link_label: 'albümü dinle',
        spoiler_level: 'yok',
        note: 'Film müziğinden ayrı bir kayıt seçkisi. Minimal piyano ve elektronik sesler, Sakamoto’nun sessizlikle kurduğu ilişkiye yakın bir dinleme alanı açıyor.',
        rights_status: 'ozgun_ozet',
      },
      {
        layer: 'once',
        section: 'eslik',
        kind: 'video',
        heading: 'Kore-eda: Screen Talk',
        publication: 'BFI',
        form_label: 'video',
        duration_note: '47 dk',
        url: 'https://player.bfi.org.uk/free/film/watch-hirokazu-kore-eda-screen-talk-2013-online',
        link_label: 'söyleşiyi aç',
        access_note: 'Erişim ülkeye veya aboneliğe göre değişebilir.',
        spoiler_level: 'yok',
        note: 'Yönetmenin çalışma biçimi ve önceki filmleri üzerine bir söyleşi.',
        rights_status: 'ozgun_ozet',
      },
    ],
    questions: [],
  },
];

/** The one real event in the brief. Location intentionally absent. */
export const events = [
  {
    number: 2,
    film_slug: '002-canavar',
    // 27 eylül 2026 pazar, 19.30 — Europe/Istanbul (UTC+03:00)
    starts_at: '2026-09-27T19:30:00+03:00',
    status: 'davet' as const,
    location_public_note: 'konum etkinlik günü davetlilere iletilecektir',
  },
];
