import { handleRequest, corsHeaders } from "./worker";
export { QuizCrocGameDO } from "./game-do";

export default {

	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		try {
			// Handle CORS preflight requests
			if (request.method === "OPTIONS") {
				return new Response(null, {
					status: 204,
					headers: corsHeaders,
				});
			}

			const url = new URL(request.url);
			if (url.pathname.startsWith("/game/")) {
      			return handleRequest(request, env, ctx);
    		}
			return env.ASSETS.fetch(request);

		} catch (err: any) {
			const status = err.status || 500;
			return new Response(JSON.stringify({ error: err.message }), {
				status,
				headers: { 
					...corsHeaders,
					"Content-Type": "application/json" 
				},
			});
		}
	},

} satisfies ExportedHandler<Env>;
