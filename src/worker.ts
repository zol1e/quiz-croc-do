import { QuestionGenerator } from "./question/question-generator";


export async function handleRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    const connectMatch = url.pathname.match(/^\/game\/([^/]+)\/ws\/?$/);
    if (connectMatch) {
        const gameId = connectMatch[1];

        // Expect to receive a WebSocket Upgrade request.
        // If there is one, accept the request and return a WebSocket Response.
        const upgradeHeader = request.headers.get('Upgrade');
        if (!upgradeHeader || upgradeHeader !== 'websocket') {
            return new Response('Worker expected Upgrade: websocket', {
                status: 426,
            });
        }

        if (request.method !== 'GET') {
            return new Response('Worker expected GET method', {
                status: 400,
            });
        }

        // Route each game ID to its own Durable Object instance.
        const doId = env.QUIZ_CROC_GAME_DO.idFromName(gameId);
        let stub = env.QUIZ_CROC_GAME_DO.get(doId);

        return await stub.fetch(request);
    }

    const createMatch = url.pathname.match(/^\/game\/create\/?$/);
    if (createMatch) {
        if (request.method !== 'PUT') {
            return new Response('Worker expected PUT method for quiz creation', {
                status: 405,
            });
        }

        const gameIdBytes = crypto.getRandomValues(new Uint8Array(4));
        const gameId = Array.from(gameIdBytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

        const topic = url.searchParams.get("topic") ?? (() => { throw new Error("Missing quiz topic!"); })();
        const apiKey = env.GOOGLE_AI_API_KEY ?? (() => { throw new Error("Missing AI_API_KEY"); })();
        const geminiModel = env.GEMINI_MODEL ?? "gemini-2.5-flash-lite";
        const questionGenerator = new QuestionGenerator(apiKey, geminiModel);
        
        const generatedQuiz = await questionGenerator.generateQuestions(topic);
        //const generatedQuiz = mockGeneratedQuiz;

        // Route each game ID to its own Durable Object instance
        const doId = env.QUIZ_CROC_GAME_DO.idFromName(gameId);
        let stub = env.QUIZ_CROC_GAME_DO.get(doId);

        // Create quiz with the generated questions
        await stub.createQuiz(gameId, JSON.stringify(generatedQuiz));

        return new Response(JSON.stringify({ gameId, quiz: generatedQuiz }), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
            },
        });
    }

    return new Response(
        `Supported endpoints: GET /game/{gameId}/ws (WebSocket upgrade), PUT /game/create?topic={topic}`,
        {
            status: 200,
            headers: {
                'Content-Type': 'text/plain',
            },
        }
    );
}


const mockGeneratedQuiz =
{
  quizName: 'Harry Potter Trivia',
  questions: [
    {
      text: 'How many points is the Golden Snitch worth?',
      correctAnswer: '150',
      alternativeAnswers: '',
      sourceUrl: 'https://harrypotter.fandom.com/wiki/Golden_Snitch'
    },
    {
      text: "What is the number of Harry Potter's parents?",
      correctAnswer: '2',
      alternativeAnswers: '',
      sourceUrl: 'https://harrypotter.fandom.com/wiki/James_Potter'
    },
    {
      text: 'What is the primary ingredient in a Polyjuice Potion?',
      correctAnswer: 'Knotgrass',
      alternativeAnswers: 'Fluxweed;Knotgrass;Lacewing Flies;Leeches',
      sourceUrl: 'https://harrypotter.fandom.com/wiki/Polyjuice_Potion'
    },
    {
      text: 'What is the name of the Weasley twins?',
      correctAnswer: 'Fred and George',
      alternativeAnswers: 'Ron and Bill;Fred and George;Arthur and Percy;Charlie and Bill',
      sourceUrl: 'https://harrypotter.fandom.com/wiki/Weasley_twins'
    },
    {
      text: "What is the core of Harry Potter's wand?",
      correctAnswer: 'Phoenix feather',
      alternativeAnswers: 'Dragon heartstring;Unicorn hair;Phoenix feather;Veela hair',
      sourceUrl: 'https://harrypotter.fandom.com/wiki/Harry_Potter%27s_wand'
    }
  ]
}
