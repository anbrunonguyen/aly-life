import { TagPlan } from './../models/money/tag-plan.model';
import { moneyOutcomeType, moneyIncomeType } from '@core/data/money';
import { Injectable } from '@angular/core';
import { Storage } from '@ionic/storage';
import { Wallet, Transaction } from '@core/models/money/wallet.model';
import { WalletType } from '@core/models/money/wallet-types.model';
import { walletType, WalletTypeString } from '@core/data/wallet-type';
import { InOutcome } from '@core/models/money/in-outcome.model';
import { getToday } from '@core/helper/getToday';
import { BehaviorSubject } from 'rxjs';
import { randomID } from '@core/helper/random-id';
import { Stock } from '@core/models/money/stock.model';

@Injectable({
  providedIn: 'root',
})
export class MoneyService {
  public wallets: Wallet[] = [];
  public walletType: WalletType[] = walletType;
  public moneyBill: InOutcome[] = [];
  public initMoneyService = new BehaviorSubject(null);
  public incomePlan: TagPlan[] = [];
  public outcomePlan: TagPlan[] = [];
  public inOutInMonth = [];
  public inOutType = [];
  public stockList: Stock[] = [];
  public changeStockList = new BehaviorSubject(null);
  constructor(private storage: Storage) {
    this.getListWallets();
    this.getStock();
    this.checkPlanAndSetDefault();
    moneyIncomeType.forEach((type) => {
      this.inOutType.push(type.id);
    });
    moneyOutcomeType.forEach((type) => {
      this.inOutType.push(type.id);
    });
  }

  getListWallets() {
    this.storage.ready().then(() => {
      this.storage.get('wallets').then((data) => {
        if (data) {
          this.wallets = data;
        }
        this.initMoneyService.next(this.wallets);
      });
    });
  }

  getCurrentBalance() {
    let currentBalance = 0;
    this.wallets.forEach((wallet) => {
      if (wallet.type !== WalletTypeString.TIN_DUNG) {
        currentBalance += wallet.currentBalance;
      }
    });
    return currentBalance;
  }

  getCurrentLoan() {
    let loan = 0;
    this.wallets.forEach((wallet) => {
      loan += wallet.loan || wallet.margin || 0;
    });
    return loan;
  }

  getDataForChart() {
    const data = [];
    this.wallets.forEach((wallet) => {
      wallet.transactions.forEach((transaction) => {
        if (transaction) {
          data.push([new Date(transaction.dateFilter), transaction.balance]);
        }
      });
    });
    return data;
  }

  get getWallet() {
    return this.wallets;
  }

  get getMoneyBill() {
    return this.moneyBill;
  }

  get getIncomePlan() {
    return this.incomePlan;
  }

  get getOutcomePlan() {
    return this.outcomePlan;
  }

  setListWallets(data: Wallet) {
    data.id = 'wallet_' + randomID();
    data.transactions = [];
    this.wallets.push(data);
    this.saveWallets();
  }

  saveWallets() {
    this.storage.ready().then(() => {
      this.storage.set(`wallets`, this.wallets).then((data) => {
        this.initMoneyService.next(this.wallets);
      });
    });
  }

  transferMoney(data) {
    let isErr = false;
    const fromWallet = this.wallets.find(
      (wallet) => wallet.name === data.wallet
    );
    if (fromWallet.currentBalance < data.money) {
      isErr = true;
    }
    if (!isErr) {
      const toWallet = this.wallets.find(
        (wallet) => wallet.name === data.toWallet
      );
      this.wallets.forEach((wallet) => {
        if (wallet.name === data.wallet) {
          wallet.currentBalance -= data.money;
          if (toWallet.type === WalletTypeString.TIN_DUNG) {
            this.setMoneyByDay(
              { ...data, type: 'outcome' },
              getToday(data.date)
            );
          }
        }
        if (wallet.name === data.toWallet) {
          wallet.currentBalance += data.money;
          if (wallet.type === WalletTypeString.TIN_DUNG) {
            wallet.loan -= data.money;
          }
        }
      });
      this.saveWallets();
    }
  }

  setMoneyByDay(moneyBill: InOutcome, day = getToday()) {
    this.moneyBill.push(moneyBill);
    this.wallets.forEach((wallet) => {
      if (wallet.name === moneyBill.wallet) {
        let transaction = wallet.transactions.find((bill) => {
          return bill.dateId === day;
        });
        if (transaction) {
          transaction.bill.push(moneyBill);
        } else {
          transaction = new Transaction(
            day,
            wallet.currentBalance,
            moneyBill.date
          );
          transaction.bill.push(moneyBill);
          wallet.transactions.push(transaction);
        }
        switch (moneyBill.type) {
          case 'income': {
            transaction.balance += moneyBill.money;
            transaction.income += moneyBill.money;
            wallet.currentBalance += moneyBill.money;
            if (wallet.type === WalletTypeString.TIN_DUNG) {
              wallet.loan -= moneyBill.money;
            }
            break;
          }
          case 'outcome': {
            transaction.balance -= moneyBill.money;
            transaction.outcome += moneyBill.money;
            wallet.currentBalance -= moneyBill.money;
            if (wallet.type === WalletTypeString.TIN_DUNG) {
              wallet.loan += moneyBill.money;
            }
            break;
          }
        }
        this.saveWallets();
      }
    });
  }

  deleteBill(moneyBill: InOutcome) {
    this.wallets.forEach((wallet) => {
      if (wallet.name === moneyBill.wallet) {
        const transaction = wallet.transactions.find((bill) => {
          return bill.dateId === getToday(moneyBill.date);
        });
        if (transaction) {
          const bill = transaction.bill.find(
            (bills) => bills.id === moneyBill.id
          );
          transaction.bill.splice(transaction.bill.indexOf(bill), 1);
        }
        switch (moneyBill.type) {
          case 'income': {
            transaction.balance -= moneyBill.money;
            transaction.income -= moneyBill.money;
            wallet.currentBalance -= moneyBill.money;
            if (wallet.type === WalletTypeString.TIN_DUNG) {
              wallet.loan += moneyBill.money;
            }
            break;
          }
          case 'outcome': {
            transaction.balance += moneyBill.money;
            transaction.outcome -= moneyBill.money;
            wallet.currentBalance += moneyBill.money;
            if (wallet.type === WalletTypeString.TIN_DUNG) {
              wallet.loan -= moneyBill.money;
            }
            break;
          }
        }
        this.saveWallets();
      }
    });
  }

  getBillByDay(day: string) {
    let result = [];
    this.wallets.forEach((wallet) => {
      result = result.concat(
        wallet.transactions.filter((transaction) => {
          return transaction.dateId === day;
        })
      );
    });
    return result;
  }

  getBillByMonth(month: number) {
    const result = [];
    this.wallets.forEach((wallet) => {
      wallet.transactions.forEach((transaction) => {
        const date = new Date(transaction.dateFilter);
        if (date.getMonth() === month) {
          const dataByDay = result.find(
            (data) => data.date === transaction.dateId
          );
          if (dataByDay) {
            dataByDay.bills = [...dataByDay.bills, ...transaction.bill];
          } else {
            result.push({ bills: transaction.bill, date: transaction.dateId });
          }
        }
      });
    });
    return result.reverse();
  }

  getInOutcomeMoneyByTag(month: number) {
    const data = {};
    this.inOutType.forEach((type) => {
      data[type] = 0;
    });
    this.wallets.forEach((wallet) => {
      wallet.transactions.forEach((transaction) => {
        transaction.bill.forEach((bill) => {
          const billDate = new Date(bill.date);
          if (billDate.getMonth() === month) {
            data[bill.tag] += bill.money;
          }
        });
      });
    });
    return data;
  }

  checkPlanAndSetDefault() {
    this.storage.ready().then(() => {
      this.storage.get('plan-setted').then((data) => {
        if (data == null) {
          this.storage.set('plan-setted', true).then(() => {
            moneyOutcomeType.forEach((outcome) => {
              this.storage
                .set('planOutcome' + outcome.id, {
                  id: outcome.id,
                  name: outcome.name,
                  value: 100000,
                  type: 'outcome',
                  icon: outcome.icon,
                })
                .then((outcomeData) => {
                  this.outcomePlan.push(outcomeData);
                });
            });
            moneyIncomeType.forEach((income) => {
              this.storage
                .set('planIncome' + income.id, {
                  id: income.id,
                  name: income.name,
                  value: 1000000,
                  type: 'income',
                  icon: income.icon,
                })
                .then((incomeData) => {
                  this.incomePlan.push(incomeData);
                });
            });
          });
        } else {
          this.getPlan();
        }
      });
    });
  }

  getPlan() {
    this.storage.ready().then(() => {
      moneyIncomeType.forEach((income) => {
        this.storage.get('planIncome' + income.id).then((data) => {
          this.incomePlan.push(data);
        });
      });
      moneyOutcomeType.forEach((outcome) => {
        this.storage.get('planOutcome' + outcome.id).then((data) => {
          this.outcomePlan.push(data);
        });
      });
    });
  }

  changePlan(changedPlan: TagPlan) {
    this.storage.ready().then(() => {
      if (changedPlan.type === 'income') {
        this.storage
          .set('planIncome' + changedPlan.id, changedPlan)
          .then(() => {
            this.incomePlan.forEach((plan) => {
              if (plan.id === changedPlan.id) {
                plan.value = changedPlan.value;
              }
            });
          });
      } else {
        this.storage
          .set('planOutcome' + changedPlan.id, changedPlan)
          .then(() => {
            this.incomePlan.forEach((plan) => {
              if (plan.id === changedPlan.id) {
                plan.value = changedPlan.value;
              }
            });
          });
      }
    });
  }

  addStock(stockInfo: Stock) {
    const currentStock = this.stockList.find(
      (stock) => stock.code === stockInfo.code
    );
    if (currentStock) {
      Object.keys(currentStock).forEach((key) => {
        currentStock[key] = stockInfo[key];
      });
    } else {
      this.stockList.push(stockInfo);
    }
    this.changeStockList.next('change');
    this.saveStock();
  }

  sellStock(stockCode: string) {
    const currentStock = this.stockList.find(
      (stock, i) => stock.code === stockCode
    );
    if (currentStock) {
      this.stockList.splice(this.stockList.indexOf(currentStock), 1);
    }
    this.saveStock();
  }

  getStock() {
    this.storage.ready().then(() => {
      this.storage.get('stock').then((data) => {
        if (data) {
          this.stockList = data;
        }
      });
    });
  }

  saveStock() {
    this.storage.ready().then(() => {
      this.storage.set('stock', this.stockList).then((data) => {});
    });
    this.changeStockList.next('Changed');
  }

  deleteStock() {}
}
