import { validate as isUuid } from "uuid";

export class TagsUsecase {
    constructor(tagsRepository) {
        this.tagsRepository = tagsRepository;
    }

    async createtags({ name, description, categoryId }) {
        try {
            if (!name || name.trim() === '') {
                throw new Error('tags name is required');
            }

            const tagsData = {
                name: name.trim(),
            };

            return await this.tagsRepository.create(tagsData);
        } catch (error) {
            throw new Error(`Failed to create tags: ${error.message}`);
        }
    }



    async getAlltags() {
        try {
            const tags = await this.tagsRepository.findAll();

            if (!tags || tags.length === 0) {
                throw new Error('No tags found');
            }

            return tags;
        } catch (error) {
            throw new Error(`Failed to get tags: ${error.message}`);
        }
    }

    async deleteTag(id) {
        try {
            if (!id) throw new Error('Tag id is required');
            return await this.tagsRepository.delete(id);
        } catch (error) {
            throw new Error(`Failed to delete tag: ${error.message}`);
        }
    }

}
