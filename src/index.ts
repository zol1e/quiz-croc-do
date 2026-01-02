import { handleRequest } from "./worker";
export { QuizCrocGameDO } from "./game-do";

export default {

	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		try {
			return handleRequest(request, env, ctx);
		} catch (err: any) {
			const status = err.status || 500;
			return new Response(JSON.stringify({ error: err.message }), {
				status,
				headers: { "Content-Type": "application/json" },
			});
		}
	},

} satisfies ExportedHandler<Env>;
