export class AuthController {
  constructor(authUsecase) {
    this.authUsecase = authUsecase;
  }

  async login(request, reply) {
    try {
      const { email, password } = request.body;
      const result = await this.authUsecase.login({ email, password });
      reply.send(result);
    } catch (error) {
      console.log(error)
      reply.status(401).send({ message: error.message });
    }
  }
}
