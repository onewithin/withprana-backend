import { validate as isUuid } from "uuid";

export class SubcategoryUsecase {
  constructor(subcategoryRepository) {
    this.subcategoryRepository = subcategoryRepository;
  }

  async createSubcategory({ name, description, categoryId }) {
    try {
      if (!name || name.trim() === "") {
        throw new Error("Subcategory name is required");
      }

      if (name.length < 2 || name.length > 50) {
        throw new Error("Subcategory name must be between 2 and 50 characters");
      }

      if (!categoryId) {
        throw new Error("Valid category ID is required");
      }

      const existingSubcategory =
        await this.subcategoryRepository.findByNameAndCategory(
          name,
          categoryId,
        );
      if (existingSubcategory) {
        throw new Error(
          "Subcategory with this name already exists in the given category",
        );
      }

      const subcategoryData = {
        name: name.trim(),
        description: description || null,
        categoryId,
      };

      return await this.subcategoryRepository.create(subcategoryData);
    } catch (error) {
      console.log(error);
      throw new Error(`Failed to create subcategory: ${error.message}`);
    }
  }

  async getSubcategoryById(id, user) {
    try {
      if (!id || !isUuid(id)) {
        throw new Error("Valid subcategory UUID is required");
      }

      const subcategory = await this.subcategoryRepository.findById(
        id,
        user?.id,
      );

      if (!subcategory) {
        throw new Error("Subcategory not found");
      }

      if (subcategory.isDeleted) {
        throw new Error("Subcategory has been deleted");
      }

      return subcategory;
    } catch (error) {
      throw new Error(`Failed to get subcategory: ${error.message}`);
    }
  }

  async getAllSubcategories(categoryId) {
    try {
      const subcategories =
        await this.subcategoryRepository.findAll(categoryId);

      if (!subcategories || subcategories.length === 0) {
        throw new Error("No subcategories found");
      }

      return subcategories;
    } catch (error) {
      throw new Error(`Failed to get subcategories: ${error.message}`);
    }
  }

  async updateSubcategory(id, data) {
    try {
      if (!id || !isUuid(id)) {
        throw new Error("Valid subcategory UUID is required");
      }

      const existingSubcategory = await this.getSubcategoryById(id);

      if (data.name) {
        if (data.name.trim() === "") {
          throw new Error("Subcategory name cannot be empty");
        }

        if (data.name.length < 2 || data.name.length > 50) {
          throw new Error(
            "Subcategory name must be between 2 and 50 characters",
          );
        }

        const subcategoryWithSameName =
          await this.subcategoryRepository.findByNameAndCategory(
            data.name,
            existingSubcategory.categoryId,
          );

        if (subcategoryWithSameName && subcategoryWithSameName.id !== id) {
          throw new Error(
            "Subcategory with this name already exists in the given category",
          );
        }

        data.name = data.name.trim();
      }

      return await this.subcategoryRepository.update(id, data);
    } catch (error) {
      throw new Error(`Failed to update subcategory: ${error.message}`);
    }
  }

  async deleteSubcategory(id) {
    try {
      if (!id || !isUuid(id)) {
        throw new Error("Valid subcategory UUID is required");
      }

      await this.getSubcategoryById(id);

      return await this.subcategoryRepository.delete(id);
    } catch (error) {
      throw new Error(`Failed to delete subcategory: ${error.message}`);
    }
  }

  async getSubcategoriesByStatus(active) {
    try {
      return await this.subcategoryRepository.findByActiveStatus(active);
    } catch (error) {
      throw new Error(
        `Failed to get subcategories by status: ${error.message}`,
      );
    }
  }

  async restoreSubcategory(id) {
    try {
      if (!id) {
        throw new Error("Valid subcategory ID is required");
      }

      const subcategory = await this.subcategoryRepository.findById(id);

      if (!subcategory) {
        throw new Error("Subcategory not found");
      }

      if (!subcategory.isDeleted) {
        throw new Error("Subcategory is not deleted");
      }

      return await this.subcategoryRepository.restore(id);
    } catch (error) {
      throw new Error(`Failed to restore subcategory: ${error.message}`);
    }
  }
}
