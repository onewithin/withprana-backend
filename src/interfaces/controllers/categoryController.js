export class CategoryController {
    constructor(categoryUsecase) {
        this.categoryUsecase = categoryUsecase;
    }

    async create(req, reply) {
        try {
            const { name, backgroundImage, icon, color } = req.body;
            const category = await this.categoryUsecase.createCategory({
                name,
                backgroundImage,
                icon,
                color
            });
            reply.send(category);
        } catch (err) {
            reply.status(400).send({ message: err.message });
        }
    }

    async getById(req, reply) {
        try {
            const id = req.params.id;
            const category = await this.categoryUsecase.getCategoryById(id);
            reply.send(category);
        } catch (err) {
            reply.status(404).send({ message: err.message });
        }
    }

    async getAll(req, reply) {
        try {
            const categories = await this.categoryUsecase.getAllCategories();
            reply.send(categories);
        } catch (err) {
            reply.status(500).send({ message: err.message });
        }
    }

    async update(req, reply) {
        try {
            const id = req.params.id;
            const data = req.body;
            const category = await this.categoryUsecase.updateCategory(id, data);
            reply.send(category);
        } catch (err) {
            reply.status(400).send({ message: err.message });
        }
    }

    async delete(req, reply) {
        try {
            const id = req.params.id;
            const result = await this.categoryUsecase.deleteCategory(id);
            reply.send(result);
        } catch (err) {
            reply.status(400).send({ message: err.message });
        }
    }
}