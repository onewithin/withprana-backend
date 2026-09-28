export class TagController {
    constructor(tagUsecase) {
        this.tagUsecase = tagUsecase;
    }

    async create(req, reply) {
        try {
            const { name } = req.body;

            const payload = {
                name: typeof name === "object" ? name.value : name,
            };

            const tag = await this.tagUsecase.createtags(payload);
            reply.send(tag);
        } catch (err) {
            reply.status(400).send({ message: err.message });
        }
    }

    async getAll(req, reply) {
        try {
            const tags = await this.tagUsecase.getAlltags();
            reply.send(tags);
        } catch (err) {
            reply.status(500).send({ message: err.message });
        }
    }

    async delete(req, reply) {
        try {
            const { id } = req.params;
            const result = await this.tagUsecase.deleteTag(id);
            reply.send(result);
        } catch (err) {
            reply.status(500).send({ message: err.message });
        }
    }


}
