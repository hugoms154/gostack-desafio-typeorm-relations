import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Product from '@modules/products/infra/typeorm/entities/Product';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';
import { IProduct as IProduct_CreateOrderDTO } from '../dtos/ICreateOrderDTO';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,
    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,
    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  private createOrdersProducts(
    products: IProduct[],
    fullProducts: Product[],
  ): IProduct_CreateOrderDTO[] {
    const ordersProducts: IProduct_CreateOrderDTO[] = [];
    products.forEach(order_product => {
      const full_product = fullProducts.filter(
        fullProduct => fullProduct.id === order_product.id,
      )[0];

      ordersProducts.push({
        quantity: order_product.quantity,
        price: full_product.price,
        product_id: full_product.id,
      });
    });

    return ordersProducts;
  }

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    // TODO
    if (!customer_id || !products)
      throw new AppError('Complete all required fields');

    const productIds = products.map(product => {
      return { id: product.id };
    });

    const customer = await this.customersRepository.findById(customer_id);
    const allProducts = await this.productsRepository.findAllById(productIds);

    const allProductIds = allProducts.map(product => product.id);

    if (!customer || !allProducts.length)
      throw new AppError('Something went wrong, please confirm data values');

    const order_products = this.createOrdersProducts(products, allProducts);

    if (!products.filter(product => !allProductIds.includes(product.id)))
      throw new AppError('Some products are could not be found');

    products.filter(product =>
      allProducts.filter(allP => {
        if (allP.id === product.id && product.quantity > allP.quantity)
          throw new AppError('Some products has no quantity available');
        return null;
      }),
    );

    const order = await this.ordersRepository.create({
      customer,
      products: order_products,
    });

    const { order_products: orderedProducts } = order;

    const orderedProductsQuantity = orderedProducts.map(product => ({
      id: product.product_id,
      quantity:
        allProducts.filter(prod => prod.id === product.product_id)[0].quantity -
        product.quantity,
    }));

    await this.productsRepository.updateQuantity(orderedProductsQuantity);

    return order;
  }
}

export default CreateOrderService;
