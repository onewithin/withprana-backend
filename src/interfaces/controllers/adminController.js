export class AdminController {
  constructor(userUseCases) {
    this.userUseCases = userUseCases;
  }

  async getUsers(request, reply) {
    try {
      const {
        signupMethod,
        subscriptionType,
        page = 1,
        limit = 10,
        sort = "createdAt",
        order,
        search,
      } = request.query;

      const users = await this.userUseCases.getUsers({
        signupMethod,
        subscriptionType,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        sort,
        order,
        search,
      });

      return reply.send({ success: true, users });
    } catch (error) {
      console.error(error);
      return reply
        .status(500)
        .send({ success: false, message: "Error fetching users" });
    }
  }


  async getUserById(request, reply) {
    try {
      const { id } = request.params;
      const user = await this.userUseCases.getUserById(id);

      if (!user) {
        return reply.status(404).send({ success: false, message: 'User not found' });
      }

      return reply.send({ success: true, user });
    } catch (error) {
      console.error(error);
      return reply.status(500).send({ success: false, message: 'Error fetching user' });
    }
  }

  async deactivateUser(request, reply) {
    try {
      const { id } = request.params;
      const user = await this.userUseCases.deactivateUser(id);
      return reply.send({ success: true, message: 'User deactivated', user });
    } catch (error) {
      console.error(error);
      return reply.status(500).send({ success: false, message: 'Error deactivating user' });
    }
  }

  async activateUser(request, reply) {
    try {
      const { id } = request.params;
      const user = await this.userUseCases.activateUser(id);
      return reply.send({ success: true, message: 'User activated', user });
    } catch (error) {
      console.error(error);
      return reply.status(500).send({ success: false, message: 'Error activating user' });
    }
  }
}
