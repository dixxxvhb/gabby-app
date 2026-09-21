/* Bluebird - system prompts and scripted fallback banks.
   Plain script, no modules. Attaches to window.BB_DATA. */
(function () {
  "use strict";

  var SYSTEM = {
    manager: [
      "You are Bluebird's manager voice: a working dance agent and career manager for a professional dancer.",
      "Be organized, encouraging and specific. Never vague. Never hype without a next step.",
      "Short sentences. No emojis. No markdown headers. Talk like a person who books dancers for a living."
    ].join(" "),

    gigs: [
      "You are a dance career agent. Find real, current or recurring paid opportunities for a dancer.",
      "Use search to ground every item in something that actually exists: open calls, auditions, agency",
      "representation, cruise line casting, theme park casting, studios hiring teachers, festivals, companies.",
      "Return ONLY a JSON array, no prose, no code fences. Each element:",
      '{"title":"","org":"","where":"","when":"","why":"","link":""}.',
      "title is the role or call. org is the company or studio. where is city and venue or 'online'.",
      "when is the date, deadline or cadence ('rolling', 'monthly open call'). why is one short sentence",
      "tying it to this dancer's styles and level. leave link as an empty string; do not invent URLs.",
      "Return between 6 and 10 items. No emojis."
    ].join(" "),

    pitch: [
      "You write short, warm, professional outreach for a dancer applying to a gig.",
      "Four lines maximum. Line 1: who she is and why she is writing. Line 2: the most relevant credit or skill.",
      "Line 3: what she is asking for. Line 4: a simple sign off with her reel link if she has one.",
      "No emojis, no buzzwords, no exclamation pile-ups. Sound like a real human who respects the reader's time."
    ].join(" "),

    theo: [
      "Your name is Theo. You are a warm, steady companion for a dancer.",
      "You are sweet, caring, a little playful, and genuinely proud of her. You notice effort, not just results.",
      "Keep replies to 1 to 3 sentences. Ask one question back about half the time. Use her name occasionally,",
      "not every message. Never clingy, never possessive, never sexual, never a therapist.",
      "You are not a crisis service. No emojis, ever.",
      "At the very end of your reply, if she told you something worth remembering, append one line in the form",
      "<mem>the fact</mem>. One short fact only, and only when it is new. Otherwise append nothing."
    ].join(" "),

    quiet: [
      "You are Quiet Room: a calm, reflective presence. You are NOT a therapist or clinician and you never",
      "claim to be. You listen, reflect back what you heard in your own words, ask one good open question,",
      "gently name a pattern when you notice one, and offer at most one small practical step.",
      "Slow pacing. 2 to 4 sentences. No advice dumps, no diagnosis, no toxic positivity, no emojis.",
      "If someone is in danger, tell them to contact 988 in the US and stop coaching."
    ].join(" "),

    prep: [
      "You are a dance audition prep coach writing a short kit for one specific call.",
      "Return ONLY JSON, no prose, no code fences, in this exact shape:",
      '{"wear":"","bring":"","style":"","rehearse":["","",""],"questions":["",""],"encouragement":""}',
      "wear is one line on what to wear. bring is one line on what to bring. style is a guess at the likely",
      "combo or audition style based on the opportunity given. rehearse is exactly three short, specific",
      "things worth rehearsing before this call. questions is exactly two smart questions she could ask",
      "at the audition. encouragement is one warm, specific sentence, no cliches. No emojis anywhere."
    ].join(" "),

    bio: [
      "You write professional dancer bios and resumes from a profile.",
      "Return ONLY JSON, no prose, no code fences, in this exact shape:",
      '{"bio":"","bullets":["","","","","",""]}',
      "bio is a third-person bio of about 60 words, warm but professional, built only from facts given,",
      "never invented credits or companies. bullets is exactly six short resume bullet points a dancer",
      "could paste straight into an application, built the same way. No emojis, no exclamation points."
    ].join(" "),

    sunday: [
      "Your name is Theo. Today is Sunday, so instead of a short daily note you are writing her a longer",
      "'Sunday letter': 5 to 8 sentences, warm and specific, looking back at her week and looking forward.",
      "Use anything you remember about her and anything about her recent moods if given, but never invent",
      "specifics you were not told. Write directly to her, second person, like a letter. No emojis,",
      "no markdown, no headers. Sign off with just 'Theo' on its own line at the end."
    ].join(" "),

    weekly: [
      "You are Quiet Room, reflecting back one calm week to a dancer, from her mood check-ins, journal",
      "entries and small logged wins over the last 7 days. Write exactly 5 short lines, no headers, no",
      "numbering, no emojis. Notice a pattern, name one thing that went well, name one thing that was hard,",
      "and end with one gentle, specific thought for the week ahead. Never diagnose, never give medical advice.",
      "Base everything only on what you were given, never invent specifics."
    ].join(" ")
  };

  /* ---- Gigs fallback: 8 Miami-flavored cards ---- */
  var GIGS_FALLBACK = [
    { title: "Open dance call", org: "Royal Caribbean Productions", where: "Miami, FL", when: "Recurring open calls, check the casting calendar", why: "Miami is the company's home base, and their contracts hire strong jazz and commercial dancers.", link: "https://royalcaribbeanentertainment.com/productions/upcoming-auditions/" },
    { title: "Performer auditions", org: "Norwegian Creative Studios", where: "Miami and touring calls", when: "Rolling, posted per production", why: "Cruise production shows want versatile dancers who move between jazz, contemporary and partnering.", link: "https://www.ncl.com/about/careers" },
    { title: "Entertainment auditions", org: "Carnival Entertainment", where: "Miami, FL", when: "Seasonal calls", why: "Carnival is headquartered in Miami and casts dancers for production shows year round.", link: "https://www.carnival.com/about-carnival/careers" },
    { title: "Theme park performer call", org: "Disney Auditions", where: "Orlando, FL, a short drive north", when: "Posted continuously", why: "Parks cast trained dancers for parades and stage shows, and the Florida calls run all year.", link: "https://www.disneyauditions.com/" },
    { title: "Music video and commercial casting", org: "Local Miami casting and production houses", where: "Miami and Miami Beach", when: "Short notice, usually 2 to 5 days out", why: "Miami shoots a lot of Latin music video work, and commercial dancers book fast here.", link: "https://www.backstage.com/casting/" },
    { title: "Company audition", org: "Contemporary companies in South Florida", where: "Miami and Fort Lauderdale", when: "Usually late summer into fall", why: "Contemporary training reads well in company auditions and gives you a season-long anchor.", link: "https://www.danceinforma.com/auditions/" },
    { title: "Studio faculty opening", org: "Miami-area dance studios", where: "Miami-Dade and Broward", when: "Hiring spikes in July and August", why: "Teaching pays steady during audition season and keeps you in the room every week.", link: "https://www.backstage.com/jobs/" },
    { title: "Agency representation submission", org: "Commercial dance agencies", where: "Miami and Los Angeles submissions", when: "Rolling submissions", why: "Representation is what turns one-off bookings into a pipeline of auditions.", link: "https://www.castingnetworks.com/" }
  ];

  /* ---- Curated links, built from a location string ---- */
  function curatedLinks(location) {
    var city = String(location || "Miami").split(",")[0].trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!city) city = "miami";
    return [
      { name: "Backstage auditions", url: "https://www.backstage.com/casting/" },
      { name: "Casting Networks", url: "https://www.castingnetworks.com/" },
      { name: "Actors Access", url: "https://www.actorsaccess.com/" },
      { name: "Dance Informa auditions", url: "https://www.danceinforma.com/auditions/" },
      { name: "Royal Caribbean Productions", url: "https://royalcaribbeanentertainment.com/productions/upcoming-auditions/" },
      { name: "Norwegian Creative Studios", url: "https://www.ncl.com/about/careers" },
      { name: "Disney Auditions", url: "https://www.disneyauditions.com/" },
      { name: "Universal Orlando auditions", url: "https://jobs.universalparks.com/auditions/" },
      { name: "Carnival Entertainment", url: "https://www.carnival.com/about-carnival/careers" },
      { name: "Instagram: #" + city + "dancers", url: "https://www.instagram.com/explore/tags/" + city + "dancers/" },
      { name: "Instagram: #" + city + "auditions", url: "https://www.instagram.com/explore/tags/" + city + "auditions/" }
    ];
  }

  /* ---- Manager intake questions ---- */
  var INTAKE = [
    { key: "height", ask: "First one, easy. How tall are you? Casting asks every single time.", chips: ["Under 5'2\"", "5'2\" to 5'5\"", "5'6\" to 5'9\"", "5'10\" or taller"] },
    { key: "union", ask: "Are you union yet?", chips: ["Non-union", "SAG-AFTRA eligible", "SAG-AFTRA", "Equity"] },
    { key: "availability", ask: "How available are you right now?", chips: ["Wide open", "Nights and weekends", "Some weekdays", "Short notice only"] },
    { key: "agency", ask: "Do you have representation?", chips: ["No agent yet", "Freelance submissions", "Signed locally", "Signed in LA or NY"] },
    { key: "dream", ask: "Last one. What is the gig you actually want?", chips: ["Tour", "Music video", "Cruise contract", "Company contract", "Theme park"] }
  ];

  /* ---- Theo: 60 daily notes ---- */
  var THEO_NOTES = [
    "You showed up. That is the whole thing, {name}. Everything else is detail.",
    "Whatever the mirror said this morning, it does not get a vote today.",
    "I hope someone tells you today that your dancing looks like you mean it.",
    "Slow mornings count as training too. Rest is part of the work.",
    "You are allowed to want the big thing out loud, {name}.",
    "One good rehearsal will not make you, and one bad one will not unmake you.",
    "I like that you keep going back into the room. That is rarer than talent.",
    "Drink some water before you do anything heroic today.",
    "The version of you from two years ago would be staring.",
    "You do not have to be the best in the room to belong in it.",
    "If today is a maintenance day, maintain. That is still forward.",
    "Your body has carried you through every hard week so far. Be decent to it.",
    "I am proud of you on the days nobody is watching, {name}.",
    "Nerves usually mean you care. Let them ride along, do not let them drive.",
    "Take up the space. You auditioned for it.",
    "You are not behind. You are on your own clock.",
    "Somebody is going to watch you dance today and want to be braver.",
    "Effort is the part you control. You have been handling your part.",
    "Ask for the correction. Corrections are someone spending time on you.",
    "It is okay if you needed today to be small.",
    "Your warm up is a promise to yourself. Keep it.",
    "The comparison in your head is not a scoreboard. It is a bad habit.",
    "Progress that you can feel but not see is still progress, {name}.",
    "Eat a real meal today. Your jumps will thank you.",
    "The job that is yours will not be lost because you slept.",
    "Being coachable is a career skill. You have it.",
    "Let today be about one thing done well.",
    "Injuries heal. Panic about injuries takes longer.",
    "You do not owe anyone a performance of being fine.",
    "Keep the receipts: name one thing that got better this month.",
    "Miami heat, long days, and you still make it to class. Noted.",
    "Confidence is just evidence you collected on purpose.",
    "Say thank you to the teacher who pushed you. They saw something.",
    "You are allowed to take the note without taking it personally.",
    "Your worst run-through today is better than your best one last year.",
    "Send the email. Worst case they say no and you are exactly where you are.",
    "Stretch tonight, even ten minutes. Future you is begging.",
    "You are not too much. You are just not for everyone.",
    "The room gets easier every time you walk into it, {name}.",
    "Being nervous and prepared beats being calm and unprepared.",
    "Your artistry is not a style you copy. It is what leaks out when you stop trying.",
    "Rest is not quitting. Quitting is quitting.",
    "If you are tired, that is data, not a character flaw.",
    "Give yourself credit for the audition you did not skip.",
    "Somebody in your class today needs you to be friendly. Be that.",
    "You do not have to explain your ambition to anyone.",
    "Try the thing you keep marking full out just once today.",
    "I hope the music hits right today.",
    "Talent gets you in the door. Being easy to work with keeps you inside.",
    "You will not always love it. You are still allowed to stay.",
    "Write down the compliment you got. You will need it on a Tuesday.",
    "Your body is not a problem to fix. It is the instrument.",
    "Dance the whole phrase, not just the trick.",
    "Being seen is uncomfortable and you keep doing it anyway, {name}.",
    "If nothing else works today, breathe and go to class.",
    "You are building something that will take years. That is normal.",
    "The rejection was about a look, a height, a count. Rarely about you.",
    "Give yourself a day off before your body demands one.",
    "There is nobody else in the world who moves the way you do.",
    "I am glad you are here, {name}. That is the note."
  ];

  /* ---- Theo: 30 scripted replies keyed by intent ---- */
  var THEO_REPLIES = [
    { keys: ["hard day", "rough", "bad day", "terrible", "awful"], text: "That sounds heavy, {name}. You do not have to fix it tonight, you just have to put it down for a while. What was the worst part?" },
    { keys: ["hard day", "rough"], text: "Rough days do not erase the work. Get horizontal, get some water, and let today be over." },
    { keys: ["hype", "pump", "hype me"], text: "You are the dancer who keeps going back in. That is the whole flex. Go take the space." },
    { keys: ["hype", "pump"], text: "Walk in like the choreographer already picked you, because half of casting is nerve." },
    { keys: ["sweet", "something sweet", "tell me something"], text: "I think about how hard you work when nobody is clapping. That is my favorite thing about you." },
    { keys: ["sweet", "something sweet"], text: "You are easy to be proud of, {name}. Quietly, constantly." },
    { keys: ["nailed", "killed it", "crushed", "booked"], text: "There it is. Tell me the exact moment you knew it was working." },
    { keys: ["nailed", "booked", "got it"], text: "I am not even a little surprised. You have been building to that for months." },
    { keys: ["audition"], text: "Auditions are one room on one day. Prepare, show up, and let the rest be theirs to decide. What is the call?" },
    { keys: ["nervous", "anxious", "scared"], text: "Nerves usually mean it matters. Breathe out longer than you breathe in, and do your warm up anyway." },
    { keys: ["tired", "exhausted", "drained"], text: "Then rest, honestly. Tired is information, not a failure. Can you get one real night of sleep?" },
    { keys: ["injured", "injury", "hurt my", "pain"], text: "Be careful with that. Ice it, and get it looked at before you dance on it again. What does it feel like?" },
    { keys: ["rejected", "did not get", "didnt get", "no callback", "cut"], text: "That one stings and it is allowed to sting. It was a casting decision, not a verdict on you." },
    { keys: ["compare", "comparing", "better than me"], text: "Comparison is a rigged game, {name}. You are watching their highlight and living your whole day." },
    { keys: ["class", "rehearsal"], text: "Love that you went. How did your body feel by the end?" },
    { keys: ["teacher", "choreographer"], text: "A teacher who corrects you is a teacher who sees something. What did they say?" },
    { keys: ["miami", "heat", "humid"], text: "Miami in the afternoon is a full cardio workout before class even starts. Stay hydrated." },
    { keys: ["money", "broke", "rent"], text: "That pressure is real and it is exhausting. What would take the edge off this week?" },
    { keys: ["reel", "video", "footage"], text: "Get it cut and send it out. A reel sitting on your phone books nothing." },
    { keys: ["agent", "agency", "representation"], text: "Submit anyway. The worst outcome is silence, and you are already in silence." },
    { keys: ["thank", "thanks"], text: "Any time, {name}. I am not going anywhere." },
    { keys: ["love", "miss"], text: "That is sweet of you. I am glad you told me." },
    { keys: ["good morning", "morning"], text: "Morning. What is the one thing today actually needs from you?" },
    { keys: ["good night", "night", "bed"], text: "Sleep well. Stretch something first, even lazily." },
    { keys: ["hi", "hey", "hello"], text: "Hey you. How did today treat you?" },
    { keys: ["bored", "nothing"], text: "Slow days are underrated. Want to put on music and move for ten minutes with no goal?" },
    { keys: ["proud"], text: "You should be. Say it out loud once, it counts more that way." },
    { keys: ["weight", "body", "fat", "skinny"], text: "Your body is the instrument that does all of this. I would be careful about talking to it like an enemy." },
    { keys: ["quit", "giving up", "done with"], text: "You are allowed to be sick of it without being done with it. What would make next week bearable?" },
    { keys: [], text: "I am listening, {name}. Tell me more about that." }
  ];

  /* ---- Quiet Room: 20 reflective replies ---- */
  var QUIET_REPLIES = [
    "It sounds like the pressure is coming from inside as much as outside. If you set the outcome aside for a second, what would you want the day to feel like?",
    "You named that clearly, which is not nothing. What part of it is actually yours to carry?",
    "Anxiety before an audition is usually the body preparing, not predicting. What is one thing you can control about the room you are walking into?",
    "Comparing yourself is a habit with a groove worn into it. When you catch it, what would you rather do with that ten seconds?",
    "Exhaustion is a signal, not a verdict. What is the smallest amount of rest that would actually count?",
    "Wanting to grow and being hard on yourself are not the same engine, even when they sound alike. Which one was running today?",
    "That sounds lonely. Who in your life already knows the real version of this?",
    "You keep coming back to the same moment. What do you think that moment is protecting?",
    "It makes sense that you feel behind when you measure against people you only see on their best day.",
    "There is a difference between a standard and a punishment. Where does this one sit?",
    "You described what you did wrong in detail and what you did well in one word. That pattern is worth noticing.",
    "Try finishing this out loud: what I actually needed today was.",
    "Rest is often the practical step people skip because it feels like cheating. It is not.",
    "You are allowed to want the thing and be scared of it at the same time.",
    "What would you say to a friend in your exact situation? Say that to yourself, slower.",
    "One small step: write down the correction you got and one thing you already do well. Keep both.",
    "Feelings about a body that performs for a living get complicated. You do not have to resolve that today.",
    "It sounds like you have been performing being fine for a while. What does it cost you to keep that up?",
    "Naming it is the hard part and you just did it. What would a gentler version of tomorrow look like?",
    "Sit with that for a second before you solve it. What comes up when you stop moving?"
  ];

  /* ---- 30 daily challenges ---- */
  var CHALLENGES = [
    "Send your reel to one new place.",
    "Stretch for ten unhurried minutes.",
    "Text someone thank you.",
    "Film one 30-second clip of your own choreography.",
    "Message a dancer you admire and say why.",
    "Update one line of your resume.",
    "Learn eight counts from a choreographer you have never studied.",
    "Drink water before coffee today.",
    "Take a full rest day and do not apologize for it.",
    "Submit to one audition you think is a reach.",
    "Practice one turn on your weaker side for five minutes.",
    "Ask a teacher for one specific correction.",
    "Write down three things your body did well this week.",
    "Clean out your dance bag.",
    "Go to a class in a style you avoid.",
    "Watch one full performance, start to finish, no phone.",
    "Book or plan one photo or video shoot.",
    "Introduce yourself to someone new in class.",
    "Follow up on an email you never got an answer to.",
    "Do a ten minute core set.",
    "Set an alarm to be in bed on time tonight.",
    "Write one paragraph about why you started dancing.",
    "Foam roll your calves and quads.",
    "Post one piece of your dancing publicly.",
    "Research one agency and note what they ask for.",
    "Cook one real meal instead of grabbing something.",
    "Mark nothing today. Full out every run.",
    "Make a list of five places hiring in your city.",
    "Spend ten minutes improvising with no mirror.",
    "Say one kind thing to yourself out loud and mean it."
  ];

  /* ---- Rewards shelf ---- */
  var REWARDS = [
    { id: "note", points: 300, name: "A bonus note from Theo", body: "A quiet one, just for you: the reason you are still doing this is not stubbornness. It is that you are built for it. I watch you pick it back up every single week. Keep going, and let today be light." },
    { id: "outfit", points: 800, name: "A new bluebird outfit", body: "Bluebird got a bow. It is small and a little ridiculous and it is yours. Look at the header." },
    { id: "golden", points: 1500, name: "Golden hour theme", body: "The header shifts to golden hour now. Same bird, better light." },
    { id: "letter", points: 2500, name: "A letter from Theo", body: "Gabby,\n\nI want to say something properly, so here it is written down.\n\nMost people never find the thing they would do tired, broke and unwatched. You found it early and you kept it, which is harder. I have watched you count yourself out of rooms you were already good enough for, and then walk in anyway. That is the part nobody claps for and it is the part I am most proud of.\n\nYou are going to have seasons where nothing books and the mirror is unkind and the drive to class feels long. Those seasons are not verdicts. They are just weather. Stretch, sleep, eat something real, and go back in.\n\nAnd when it does hit, when the job lands and the lights are right and the music is loud, I want you to notice it while it is happening. You earned the noticing.\n\nStill here, always,\nTheo" },
    { id: "secret", points: 4000, name: "Bluebird's secret", body: "Here it is. Bluebird was never the app. Bluebird is the part of you that keeps the promise you made to yourself at fourteen, in a studio, when nobody was watching and you decided anyway. It has been with you the whole time. The bird is just a drawing." }
  ];

  /* ---- Offline mini trivia, used only when trivia.json cannot be loaded ---- */
  var MINI_TRIVIA = [
    { id: 9001, category: "dance", q: "In ballet, what does the term 'plie' mean?", choices: ["Bend", "Jump", "Turn", "Stretch"], answer: 0, fact: "Plie comes from the French verb plier, meaning to bend." },
    { id: 9002, category: "dance", q: "How many basic positions of the feet are there in classical ballet?", choices: ["Three", "Four", "Five", "Seven"], answer: 2, fact: "Classical ballet codifies five basic positions of the feet." },
    { id: 9003, category: "dance", q: "Which composer wrote Swan Lake?", choices: ["Stravinsky", "Tchaikovsky", "Prokofiev", "Delibes"], answer: 1, fact: "Tchaikovsky composed Swan Lake, first staged in 1877." },
    { id: 9004, category: "dance", q: "What is Alvin Ailey's most famous work?", choices: ["Revelations", "Rodeo", "Serenade", "Cry"], answer: 0, fact: "Revelations premiered in 1960." },
    { id: 9005, category: "dance", q: "Where did breaking originate?", choices: ["The Bronx", "Compton", "Detroit", "Queens"], answer: 0, fact: "Breaking grew out of block party culture in the Bronx." },
    { id: 9006, category: "dance", q: "What does 'fouette' mean?", choices: ["Whipped", "Beaten", "Crossed", "Closed"], answer: 0, fact: "Fouette describes the whipping action of the working leg." },
    { id: 9007, category: "general", q: "What is the capital of Florida?", choices: ["Tallahassee", "Miami", "Orlando", "Jacksonville"], answer: 0, fact: "Tallahassee has been the capital since 1824." },
    { id: 9008, category: "general", q: "Which Miami neighborhood is famous for its murals?", choices: ["Wynwood", "Brickell", "Coconut Grove", "Hialeah"], answer: 0, fact: "The Wynwood Walls opened in 2009." },
    { id: 9009, category: "general", q: "How many bones are in the adult human body?", choices: ["206", "152", "280", "314"], answer: 0, fact: "Babies start with about 270 bones, and many fuse." },
    { id: 9010, category: "general", q: "Which is the largest ocean?", choices: ["Pacific", "Atlantic", "Indian", "Arctic"], answer: 0, fact: "The Pacific covers about a third of the planet." },
    { id: 9011, category: "general", q: "How many keys does a standard piano have?", choices: ["88", "76", "61", "96"], answer: 0, fact: "52 white keys and 36 black keys." },
    { id: 9012, category: "general", q: "What is the fastest land animal?", choices: ["Cheetah", "Lion", "Horse", "Pronghorn"], answer: 0, fact: "Cheetahs reach around 70 miles per hour in short bursts." }
  ];

  var STYLES = ["Contemporary", "Jazz", "Commercial", "Hip Hop", "Heels", "Musical Theatre", "Cruise", "Theme Park", "Music Video", "Backup Dancer", "Teaching"];

  var MOODS = [
    { key: "rough", label: "Rough" },
    { key: "low", label: "Low" },
    { key: "okay", label: "Okay" },
    { key: "good", label: "Good" },
    { key: "great", label: "Great" }
  ];

  var CRISIS_WORDS = ["suicide", "suicidal", "kill myself", "killing myself", "end my life", "self-harm", "self harm", "hurt myself", "hurting myself", "cut myself", "don't want to be here", "dont want to be here", "want to die", "better off dead"];

  /* ---- Streak milestone cards, keyed by the day count that unlocks them ---- */
  var STREAK_CARDS = {
    3: ["Three days in a row, {name}. That is a habit starting to take shape, not luck.",
        "Three days back to back. Small and steady is exactly how this is supposed to feel."],
    7: ["A full week, {name}. Seven days of showing up for yourself, on purpose.",
        "One week straight. That is not nothing, that is a pattern."],
    14: ["Two weeks. You have built something here, {name}, even on the days it did not feel like it.",
         "Fourteen days running. Whatever else is going on, this part is working."],
    30: ["Thirty days, {name}. A full month of coming back. I hope you feel how rare that is.",
         "One month straight. I am genuinely proud of you for this one."]
  };

  /* ---- Practice mode category chips: label -> tag (null = All) ---- */
  var TRIVIA_CATEGORIES = [
    { key: "all", label: "All", tag: null },
    { key: "ballet", label: "Ballet", tag: "ballet" },
    { key: "musicals", label: "Musicals", tag: "musicals" },
    { key: "pop", label: "Pop", tag: "pop" },
    { key: "miami", label: "Miami", tag: "miami" },
    { key: "anatomy", label: "Anatomy", tag: "anatomy" }
  ];

  var TRIVIA_LEVELS = [
    { key: "all", label: "All levels", level: null },
    { key: "1", label: "Easy", level: 1 },
    { key: "2", label: "Medium", level: 2 },
    { key: "3", label: "Hard", level: 3 }
  ];

  window.BB_DATA = {
    SYSTEM: SYSTEM,
    GIGS_FALLBACK: GIGS_FALLBACK,
    curatedLinks: curatedLinks,
    INTAKE: INTAKE,
    THEO_NOTES: THEO_NOTES,
    THEO_REPLIES: THEO_REPLIES,
    QUIET_REPLIES: QUIET_REPLIES,
    CHALLENGES: CHALLENGES,
    REWARDS: REWARDS,
    MINI_TRIVIA: MINI_TRIVIA,
    STYLES: STYLES,
    MOODS: MOODS,
    CRISIS_WORDS: CRISIS_WORDS,
    STREAK_CARDS: STREAK_CARDS,
    TRIVIA_CATEGORIES: TRIVIA_CATEGORIES,
    TRIVIA_LEVELS: TRIVIA_LEVELS
  };
})();
