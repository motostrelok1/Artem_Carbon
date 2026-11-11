export const catalog=Object.freeze({
 video_lesson:{name:'Изготовление карбоновой детали',price:200000},
 carbon_helmet:{name:'Каска карбоновая',price:3500000},
 carbon_spoon:{name:'Ложка карбоновая',price:2500000},
 carbon_knife:{name:'Нож карбоновый',price:1000000}
});
export function validateCart(items){
 if(!Array.isArray(items)||items.length!==1)throw new Error('Choose one product');
 const {sku,quantity}=items[0]||{};
 if(!Object.hasOwn(catalog,sku)||!Number.isSafeInteger(quantity)||quantity<1||quantity>100)throw new Error('Invalid product or quantity');
 const amount=catalog[sku].price*quantity;
 if(!Number.isSafeInteger(amount)||amount<=0)throw new Error('Invalid amount');
 return {sku,quantity,unitPrice:catalog[sku].price,amount};
}
