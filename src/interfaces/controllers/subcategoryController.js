export class SubcategoryController {
  constructor(subcategoryUsecase) {
    this.subcategoryUsecase = subcategoryUsecase;
  }

  async create(req, reply) {
    try {
      const { name, color, categoryId } = req.body;

      const payload = {
        name: typeof name === "object" ? name.value : name,
        color: typeof color === "object" ? color.value : color,
        categoryId: categoryId,
      };

      const subcategory =
        await this.subcategoryUsecase.createSubcategory(payload);
      reply.send(subcategory);
    } catch (err) {
      reply.status(400).send({ message: err.message });
    }
  }

  async getById(req, reply) {
    try {
      const id = req.params.id;
      const user = req.user;
      const subcategory = await this.subcategoryUsecase.getSubcategoryById(
        id,
        user,
      );
      reply.send(subcategory);
    } catch (err) {
      reply.status(404).send({ message: err.message });
    }
  }

  async getAll(req, reply) {
    try {
      const { categoryId } = req.query;
      const subcategories =
        await this.subcategoryUsecase.getAllSubcategories(categoryId);
      reply.send(subcategories);
    } catch (err) {
      reply.status(500).send({ message: err.message });
    }
  }

  async update(req, reply) {
    try {
      const id = req.params.id;
      const { name, color, categoryId } = req.body;

      const payload = {
        ...(name && { name: typeof name === "object" ? name.value : name }),
        ...(color && {
          color: typeof color === "object" ? color.value : color,
        }),
        ...(categoryId && { categoryId: parseInt(categoryId, 10) }),
      };

      const subcategory = await this.subcategoryUsecase.updateSubcategory(
        id,
        payload,
      );
      reply.send(subcategory);
    } catch (err) {
      reply.status(400).send({ message: err.message });
    }
  }

  async delete(req, reply) {
    try {
      const id = req.params.id;
      const result = await this.subcategoryUsecase.deleteSubcategory(id);
      reply.send(result);
    } catch (err) {
      reply.status(400).send({ message: err.message });
    }
  }
}
