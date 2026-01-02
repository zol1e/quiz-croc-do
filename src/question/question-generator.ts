import { GenerateContentParameters, GoogleGenAI, Type } from "@google/genai";
import { Question } from "./question";


export type GeneratedQuiz = {
    quizName: string;
    questions: Question[];
};


export class QuestionGenerator {
	
    googleGenAi: GoogleGenAI;
    geminiModel: string;

    constructor(apiKey: string, geminiModel: string) {
		this.googleGenAi = new GoogleGenAI({ apiKey: apiKey });
        this.geminiModel = geminiModel;
	}

    public async generateQuestions(topic: string): Promise<GeneratedQuiz> {
        const prompt = [
            "Give two questions, which answer is a positive integer",
            " and three questions, which has 4 alternatives and only the one of them is the correct answer.",
            " The alternative answer questions should not contain answers, which answer is a positive integer.",
            " So give 3 wrong answers and the correct answer.",
            " The topic of the questions should be:",
            topic,
            " The result should be in json format. ",
            " The alternativeAnswers should be semicolon separated text values.",
            " The 4 alternative answers should include the correct answer.",
            " In case of the two questions, which answers should be positive integer, the alternativeAnswers field should be empty.",
            " The correctAnswer field should always contains the correct answer.",
            " The text field should be the question.",
            " Give a nice name for the quiz based on the topic. The quiz name should be short, maximum 40 characters.",
            " The json object should have two properties: string name and the list of questions."
        ].join(" ");

        const result = await this.executePrompt(prompt);
        const quizObject = JSON.parse(result);
        console.log(quizObject);

        const questions: Question[] = []
        let idx = 0;
        for (const question of quizObject.questions) {
            let alternativeAnswers = null;
            if (question.alternativeAnswers) {
                alternativeAnswers = question.alternativeAnswers.split(";");
            } else {
                alternativeAnswers = []
            }
            questions.push(
                new Question(
                    idx.toString(), question.text, question.sourceUrl, question.correctAnswer, alternativeAnswers
                )
            );
            idx += 1;
        }
        return { quizName: quizObject.quizName, questions };
    }

    private async executePrompt(prompt: string): Promise<string> {
        const result = await this.googleGenAi.models.generateContent(this.createConfig(prompt));
        return result.text as string;
    }

    private createConfig(contents: string): GenerateContentParameters {
        const schema = {
            type: Type.OBJECT,
            description: "Quiz with name and questions",
            properties: {
                quizName: { type: Type.STRING, description: "Name of the quiz", nullable: false },
                questions: {
                    description: "List of questions",
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            text: {
                                type: Type.STRING,
                                description: "Question text",
                                nullable: false,
                            },
                            correctAnswer: {
                                type: Type.STRING,
                                description: "Correct answer",
                                nullable: false,
                            },
                            alternativeAnswers: {
                                type: Type.STRING,
                                description: "Alternative answers, with correct answer always included, in random order",
                                nullable: false,
                            },
                            sourceUrl: {
                                type: Type.STRING,
                                description: "The answer is based on this internet page url. Only if valid source url exists.",
                                nullable: true,
                            },
                        },
                        required: ['text', 'correctAnswer', 'alternativeAnswers', 'sourceUrl'],
                    }
                }
            },
            required: ['quizName', 'questions'],
        };

        return {
            model: this.geminiModel,
            contents: contents,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema,
            },
        };
    }
}
