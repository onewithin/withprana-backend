export class CategoryUsecase {
    constructor(categoryRepository) {
        this.categoryRepository = categoryRepository;
    }

    async createCategory({ name, backgroundImage, icon, color }) {
        try {
            if (!name || name.trim() === '') {
                throw new Error('Category name is required');
            }

            if (name.length < 2 || name.length > 50) {
                throw new Error('Category name must be between 2 and 50 characters');
            }

            const existingCategory = await this.categoryRepository.findByName(name);
            if (existingCategory) {
                throw new Error('Category with this name already exists');
            }

            if (backgroundImage && !this.isValidUrl(backgroundImage)) {
                throw new Error('Invalid background image URL');
            }

            if (icon && !this.isValidUrl(icon)) {
                throw new Error('Invalid icon URL');
            }

            const categoryData = {
                name: name.trim(),
                backgroundImage: backgroundImage || null,
                icon: icon || null,
                color: color
            };

            return await this.categoryRepository.create(categoryData);
        } catch (error) {
            throw new Error(`Failed to create category: ${error.message}`);
        }
    }

    async getCategoryById(id) {
        try {
            if (!id) {
                throw new Error('Valid category ID is required');
            }

            const category = await this.categoryRepository.findById(id);

            if (!category) {
                throw new Error('Category not found');
            }

            if (category.isDeleted) {
                throw new Error('Category has been deleted');
            }

            return category;
        } catch (error) {
            throw new Error(`Failed to get category: ${error.message}`);
        }
    }

    async getAllCategories() {
        try {
            const categories = await this.categoryRepository.findAll();

            if (!categories || categories.length === 0) {
                throw new Error('No categories found');
            }

            return categories;
        } catch (error) {
            throw new Error(`Failed to get categories: ${error.message}`);
        }
    }

    async updateCategory(id, data) {
        try {
            if (!id) {
                throw new Error('Valid category ID is required');
            }

            const existingCategory = await this.getCategoryById(id);

            if (data.name) {
                if (data.name.trim() === '') {
                    throw new Error('Category name cannot be empty');
                }

                if (data.name.length < 2 || data.name.length > 50) {
                    throw new Error('Category name must be between 2 and 50 characters');
                }

                const categoryWithSameName = await this.categoryRepository.findByName(data.name);
                if (categoryWithSameName && categoryWithSameName.id !== id) {
                    throw new Error('Category with this name already exists');
                }

                data.name = data.name.trim();
            }

            if (data.backgroundImage && !this.isValidUrl(data.backgroundImage)) {
                throw new Error('Invalid background image URL');
            }

            if (data.icon && !this.isValidUrl(data.icon)) {
                throw new Error('Invalid icon URL');
            }

            return await this.categoryRepository.update(id, data);
        } catch (error) {
            throw new Error(`Failed to update category: ${error.message}`);
        }
    }

    async deleteCategory(id) {
        try {
            if (!id) {
                throw new Error('Valid category ID is required');
            }

            await this.getCategoryById(id);

            return await this.categoryRepository.delete(id);
        } catch (error) {
            throw new Error(`Failed to delete category: ${error.message}`);
        }
    }

    isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }

    async getCategoriesByStatus(active) {
        try {
            return await this.categoryRepository.findByActiveStatus(active);
        } catch (error) {
            throw new Error(`Failed to get categories by status: ${error.message}`);
        }
    }

    async restoreCategory(id) {
        try {
            if (!id) {
                throw new Error('Valid category ID is required');
            }

            const category = await this.categoryRepository.findById(id);

            if (!category) {
                throw new Error('Category not found');
            }

            if (!category.isDeleted) {
                throw new Error('Category is not deleted');
            }

            return await this.categoryRepository.restore(id);
        } catch (error) {
            throw new Error(`Failed to restore category: ${error.message}`);
        }
    }
}